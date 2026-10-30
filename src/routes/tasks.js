import { Router } from 'express';
import { COMPLETED, UNASSIGNED } from '../config/constants.js';
import { validate } from '../middleware/validate.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { applyProgress, resolveProgress } from '../services/taskState.js';
import { deadlineToDate, deadlineToDay, today } from '../utils/dates.js';
import { HttpError } from '../utils/httpError.js';
import {
  taskCompleteSchema,
  taskCreateSchema,
  taskQuerySchema,
  taskUpdateEntrySchema,
  taskUpdateSchema,
} from '../validators/index.js';

const router = Router();

const person = (user) => (user ? { id: String(user._id), name: user.name } : null);

function serializeSummary(task) {
  const deadline = deadlineToDay(task.deadline);
  return {
    id: String(task._id),
    title: task.title,
    description: task.description,
    priority: task.priority,
    deadline,
    overdue: task.status !== COMPLETED && deadline < today(),
    project: task.project ? { id: String(task.project._id), name: task.project.name } : null,
    assignee: person(task.assignee),
    createdBy: person(task.createdBy),
    status: task.status,
    completionPercent: task.completionPercent,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function serializeDetail(task) {
  return {
    ...serializeSummary(task),
    finalSummary: task.finalSummary,
    updates: [...task.updates]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((update) => ({
        id: String(update._id),
        author: person(update.author),
        text: update.text,
        percent: update.percent ?? null,
        createdAt: update.createdAt,
      })),
  };
}

const POPULATE = [
  { path: 'project', select: 'name' },
  { path: 'assignee', select: 'name' },
  { path: 'createdBy', select: 'name' },
];

async function findTask(id) {
  const task = await Task.findById(id);
  if (!task) throw new HttpError(404, 'That task was not found.');
  return task;
}

async function sendDetail(res, task, status = 200) {
  await task.populate([...POPULATE, { path: 'updates.author', select: 'name' }]);
  res.status(status).json({ task: serializeDetail(task) });
}

async function assertReferences({ project, assignee }) {
  const fields = {};
  if (project && !(await Project.exists({ _id: project }))) fields.project = 'That project no longer exists.';
  if (assignee && !(await User.exists({ _id: assignee }))) fields.assignee = 'That team member no longer exists.';
  if (Object.keys(fields).length) throw new HttpError(400, 'Please check the highlighted fields.', fields);
}

const SUMMARY_REQUIRED = new HttpError(400, 'Add a final summary to complete this task.', {
  finalSummary: 'Add a final summary to complete this task.',
});

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildFilter(query) {
  const filter = {};
  if (query.q) filter.title = { $regex: escapeRegex(query.q), $options: 'i' };
  if (query.project) filter.project = query.project === 'none' ? null : query.project;
  if (query.assignee) filter.assignee = query.assignee === UNASSIGNED ? null : query.assignee;
  if (query.status) filter.status = query.status;
  if (query.deadlineFrom || query.deadlineTo) {
    filter.deadline = {};
    if (query.deadlineFrom) filter.deadline.$gte = deadlineToDate(query.deadlineFrom);
    if (query.deadlineTo) filter.deadline.$lte = deadlineToDate(query.deadlineTo);
  }
  if (query.overdue === 'true') {
    filter.deadline = { ...filter.deadline, $lt: deadlineToDate(today()) };
    if (query.status === COMPLETED) filter._id = null;
    else filter.status ??= { $ne: COMPLETED };
  }
  return filter;
}

router.get('/', validate(taskQuerySchema, 'query'), async (req, res) => {
  const { page, limit, ...query } = req.valid.query;
  const filter = buildFilter(query);
  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .select('-updates -history')
      .populate(POPULATE)
      .sort({ deadline: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Task.countDocuments(filter),
  ]);
  res.json({ tasks: tasks.map(serializeSummary), total, page, limit });
});

router.post('/', validate(taskCreateSchema), async (req, res) => {
  const { deadline, status, completionPercent, ...fields } = req.valid.body;
  await assertReferences(fields);
  if (status === COMPLETED && !fields.finalSummary) throw SUMMARY_REQUIRED;

  const now = new Date();
  const next = resolveProgress({ status: 'To Do', completionPercent: 0 }, { status, completionPercent }, now);
  const task = await Task.create({
    ...fields,
    deadline: deadlineToDate(deadline),
    createdBy: req.user._id,
    status: next.status,
    completionPercent: next.percent,
    completedAt: next.completedAt,
    history: [{ status: next.status, percent: next.percent, at: now }],
  });
  await sendDetail(res, task, 201);
});

router.get('/:id', async (req, res) => {
  await sendDetail(res, await findTask(req.params.id));
});

router.put('/:id', validate(taskUpdateSchema), async (req, res) => {
  const task = await findTask(req.params.id);
  const { deadline, status, completionPercent, ...fields } = req.valid.body;
  await assertReferences(fields);

  const summary = fields.finalSummary ?? task.finalSummary;
  if (status === COMPLETED && !summary) throw SUMMARY_REQUIRED;

  const previousAssignee = task.assignee ? String(task.assignee) : null;
  task.set(fields);
  if (deadline) task.deadline = deadlineToDate(deadline);

  if (fields.assignee !== undefined && fields.assignee !== previousAssignee) {
    const assignee = fields.assignee && (await User.findById(fields.assignee).select('name').lean());
    task.updates.push({ author: req.user._id, text: assignee ? `Assigned to ${assignee.name}.` : 'Marked as unassigned.' });
  }

  const { statusChanged } = applyProgress(task, { status, completionPercent });
  if (statusChanged) {
    task.updates.push({
      author: req.user._id,
      text: `Status changed to ${task.status}.`,
      percent: task.completionPercent,
    });
  }
  await task.save();
  await sendDetail(res, task);
});

router.post('/:id/updates', validate(taskUpdateEntrySchema), async (req, res) => {
  const task = await findTask(req.params.id);
  const { text, percent } = req.valid.body;

  if (percent !== undefined) applyProgress(task, { completionPercent: percent });
  task.updates.push({ author: req.user._id, text, percent: percent === undefined ? undefined : task.completionPercent });
  await task.save();
  await sendDetail(res, task, 201);
});

router.post('/:id/complete', validate(taskCompleteSchema), async (req, res) => {
  const task = await findTask(req.params.id);
  const { finalSummary } = req.valid.body;

  const wasCompleted = task.status === COMPLETED;
  task.finalSummary = finalSummary;
  applyProgress(task, { status: COMPLETED });
  task.updates.push({
    author: req.user._id,
    text: wasCompleted ? 'Final summary edited.' : 'Marked as completed.',
    percent: 100,
  });
  await task.save();
  await sendDetail(res, task);
});

router.delete('/:id', async (req, res) => {
  const task = await findTask(req.params.id);
  await task.deleteOne();
  res.json({ message: 'Task deleted.' });
});

export default router;
