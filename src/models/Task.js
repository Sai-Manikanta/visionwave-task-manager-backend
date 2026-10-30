import mongoose from 'mongoose';
import { PRIORITIES, TASK_STATUSES } from '../config/constants.js';

const { ObjectId } = mongoose.Schema.Types;

const updateSchema = new mongoose.Schema({
  author: { type: ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true },
  percent: { type: Number, min: 0, max: 100 },
  createdAt: { type: Date, default: Date.now },
});

// Every status or percent change, so reports on past dates show the task as it was then.
const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: TASK_STATUSES, required: true },
    percent: { type: Number, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    priority: { type: String, enum: PRIORITIES, default: 'Medium' },
    deadline: { type: Date, required: true },
    project: { type: ObjectId, ref: 'Project', default: null },
    assignee: { type: ObjectId, ref: 'User', default: null },
    createdBy: { type: ObjectId, ref: 'User', required: true },
    status: { type: String, enum: TASK_STATUSES, default: 'To Do' },
    completionPercent: { type: Number, min: 0, max: 100, default: 0 },
    updates: { type: [updateSchema], default: [] },
    history: { type: [historySchema], default: [] },
    finalSummary: { type: String, default: '', trim: true },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

taskSchema.index({ assignee: 1 });
taskSchema.index({ project: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ deadline: 1 });
taskSchema.index({ completedAt: 1 });

export const Task = mongoose.model('Task', taskSchema);
