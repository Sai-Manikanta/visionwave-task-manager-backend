import { COMPLETED, UNASSIGNED } from '../config/constants.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { addDays, dayRange, deadlineToDay, today, weekRange } from '../utils/dates.js';

// The task as it stood just before `end`, or null if it didn't exist yet.
export function stateAt(task, end) {
  let state = null;
  let completedOn = null;
  for (const entry of task.history) {
    if (entry.at >= end) break;
    if (entry.status === COMPLETED && state?.status !== COMPLETED) completedOn = entry.at;
    state = { status: entry.status, percent: entry.percent };
  }
  return state && { ...state, completedOn };
}

// Tasks finished before the period and still finished then don't belong to it.
export function bucketFor(state, start) {
  if (!state) return null;
  if (state.status === COMPLETED) return state.completedOn >= start ? 'completed' : null;
  return { 'To Do': 'pending', 'In Progress': 'inProgress', 'In Review': 'inReview' }[state.status];
}

async function loadTasks(rangeStart, rangeEnd) {
  return Task.find({
    createdAt: { $lt: rangeEnd },
    $or: [{ completedAt: null }, { completedAt: { $gte: rangeStart } }],
  })
    .select('title project assignee priority deadline history status')
    .populate('project', 'name')
    .populate('assignee', 'name')
    .sort({ deadline: 1 })
    .lean();
}

function completedPerDay(tasks, days) {
  return days.map((day) => {
    const { start, end } = dayRange(day);
    const completed = tasks.filter((task) => bucketFor(stateAt(task, end), start) === 'completed');
    return { day, completed: completed.length };
  });
}

async function buildReport({ start, end, lastDay, seriesDays, ...period }) {
  const seriesStart = dayRange(seriesDays[0]).start;
  const [tasks, users] = await Promise.all([
    loadTasks(seriesStart, end),
    User.find().select('name').sort({ name: 1 }).lean(),
  ]);

  const groups = { completed: [], inProgress: [], inReview: [], pending: [] };
  const emptyMember = (id, name) => ({ id, name, completed: 0, inProgress: 0, inReview: 0, pending: 0, totalPercent: 0, taskCount: 0 });
  const members = new Map(users.map((user) => [String(user._id), emptyMember(String(user._id), user.name)]));
  const unassigned = emptyMember(UNASSIGNED, 'Unassigned');

  for (const task of tasks) {
    const state = stateAt(task, end);
    const bucket = bucketFor(state, start);
    if (!bucket) continue;

    const deadline = deadlineToDay(task.deadline);
    groups[bucket].push({
      id: String(task._id),
      title: task.title,
      project: task.project ? { id: String(task.project._id), name: task.project.name } : null,
      assignee: task.assignee ? { id: String(task.assignee._id), name: task.assignee.name } : null,
      status: state.status,
      completionPercent: state.percent,
      deadline,
      completedAt: bucket === 'completed' ? state.completedOn : null,
      overdue: bucket !== 'completed' && deadline < lastDay,
    });

    const member = task.assignee ? members.get(String(task.assignee._id)) : unassigned;
    if (member) {
      member[bucket] += 1;
      member.totalPercent += state.percent;
      member.taskCount += 1;
    }
  }
  if (unassigned.taskCount) members.set(UNASSIGNED, unassigned);

  return {
    ...period,
    totals: {
      completed: groups.completed.length,
      inProgress: groups.inProgress.length,
      inReview: groups.inReview.length,
      pending: groups.pending.length,
    },
    tasks: groups,
    members: [...members.values()].map(({ totalPercent, taskCount, ...member }) => ({
      ...member,
      averagePercent: taskCount ? Math.round(totalPercent / taskCount) : 0,
    })),
    completedSeries: completedPerDay(tasks, seriesDays),
  };
}

export function dailyReport(date = today()) {
  const { start, end } = dayRange(date);
  // The chart on the daily view shows the seven days leading up to the date.
  const seriesDays = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6));
  return buildReport({ period: 'daily', date, first: date, last: date, start, end, lastDay: date, seriesDays });
}

export function weeklyReport(date = today()) {
  const { first, last, start, end } = weekRange(date);
  const seriesDays = Array.from({ length: 7 }, (_, i) => addDays(first, i));
  return buildReport({ period: 'weekly', date, first, last, start, end, lastDay: last, seriesDays });
}
