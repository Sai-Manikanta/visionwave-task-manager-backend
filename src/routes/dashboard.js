import { Router } from 'express';
import { COMPLETED } from '../config/constants.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { dayRange, deadlineToDate, today } from '../utils/dates.js';

const router = Router();

router.get('/', async (_req, res) => {
  const day = today();
  const { start, end } = dayRange(day);

  const [activeTasks, completedToday, inProgress, pending, overdue, unassigned, activeProjects, recent] = await Promise.all([
    Task.countDocuments({ status: { $ne: COMPLETED } }),
    Task.countDocuments({ status: COMPLETED, completedAt: { $gte: start, $lt: end } }),
    Task.countDocuments({ status: 'In Progress' }),
    Task.countDocuments({ status: 'To Do' }),
    Task.countDocuments({ status: { $ne: COMPLETED }, deadline: { $lt: deadlineToDate(day) } }),
    Task.countDocuments({ status: { $ne: COMPLETED }, assignee: null }),
    Project.countDocuments({ status: 'Active' }),
    Task.aggregate([
      { $project: { title: 1, updates: 1 } },
      { $unwind: '$updates' },
      { $sort: { 'updates.createdAt': -1 } },
      { $limit: 10 },
    ]),
  ]);

  const authors = await User.find({ _id: { $in: recent.map((r) => r.updates.author) } }).select('name').lean();
  const authorNames = new Map(authors.map((a) => [String(a._id), a.name]));

  res.json({
    today: day,
    cards: { activeTasks, completedToday, inProgress, pending, overdue, unassigned, activeProjects },
    recentUpdates: recent.map((row) => ({
      id: String(row.updates._id),
      taskId: String(row._id),
      taskTitle: row.title,
      author: authorNames.get(String(row.updates.author)) ?? 'Unknown',
      text: row.updates.text,
      percent: row.updates.percent ?? null,
      createdAt: row.updates.createdAt,
    })),
  });
});

export default router;
