import mongoose from 'mongoose';
import { COMPLETED } from '../config/constants.js';
import { Task } from '../models/Task.js';

// The one definition of project progress: the average completion of its tasks.
export function averageProgress(totalPercent, taskCount) {
  return taskCount ? Math.round(totalPercent / taskCount) : 0;
}

// Returns a Map of project id to { progress, taskCount, completedCount }.
export async function projectStats(projectIds) {
  const ids = projectIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const rows = await Task.aggregate([
    { $match: { project: { $in: ids } } },
    {
      $group: {
        _id: '$project',
        totalPercent: { $sum: '$completionPercent' },
        taskCount: { $sum: 1 },
        completedCount: { $sum: { $cond: [{ $eq: ['$status', COMPLETED] }, 1, 0] } },
      },
    },
  ]);
  return new Map(
    rows.map((row) => [
      String(row._id),
      {
        progress: averageProgress(row.totalPercent, row.taskCount),
        taskCount: row.taskCount,
        completedCount: row.completedCount,
      },
    ]),
  );
}

export const EMPTY_STATS = { progress: 0, taskCount: 0, completedCount: 0 };
