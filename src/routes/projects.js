import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { EMPTY_STATS, projectStats } from '../services/progress.js';
import { deadlineToDate, deadlineToDay } from '../utils/dates.js';
import { HttpError } from '../utils/httpError.js';
import { projectCreateSchema, projectUpdateSchema } from '../validators/index.js';

const router = Router();

function serialize(project, stats = EMPTY_STATS) {
  return {
    id: String(project._id),
    name: project.name,
    description: project.description,
    status: project.status,
    deadline: deadlineToDay(project.deadline),
    createdAt: project.createdAt,
    ...stats,
  };
}

function toDocument(body) {
  const doc = { ...body };
  if (body.deadline !== undefined) doc.deadline = body.deadline && deadlineToDate(body.deadline);
  return doc;
}

async function findProject(id) {
  const project = await Project.findById(id);
  if (!project) throw new HttpError(404, 'That project was not found.');
  return project;
}

router.get('/', async (_req, res) => {
  const projects = await Project.find().sort({ createdAt: -1 }).lean();
  const stats = await projectStats(projects.map((p) => p._id));
  res.json({ projects: projects.map((p) => serialize(p, stats.get(String(p._id)))) });
});

router.post('/', validate(projectCreateSchema), async (req, res) => {
  const project = await Project.create({ ...toDocument(req.valid.body), createdBy: req.user._id });
  res.status(201).json({ project: serialize(project) });
});

router.get('/:id', async (req, res) => {
  const project = await findProject(req.params.id);
  const stats = await projectStats([project._id]);
  res.json({ project: serialize(project, stats.get(String(project._id))) });
});

router.put('/:id', validate(projectUpdateSchema), async (req, res) => {
  const project = await findProject(req.params.id);
  project.set(toDocument(req.valid.body));
  await project.save();
  const stats = await projectStats([project._id]);
  res.json({ project: serialize(project, stats.get(String(project._id))) });
});

router.delete('/:id', async (req, res) => {
  const project = await findProject(req.params.id);
  const taskCount = await Task.countDocuments({ project: project._id });
  if (taskCount) {
    throw new HttpError(
      409,
      `This project still has ${taskCount} task${taskCount === 1 ? '' : 's'}. Move or delete them first.`,
    );
  }
  await project.deleteOne();
  res.json({ message: 'Project deleted.' });
});

export default router;
