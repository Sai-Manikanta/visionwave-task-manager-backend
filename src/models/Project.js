import mongoose from 'mongoose';
import { PROJECT_STATUSES } from '../config/constants.js';

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    deadline: { type: Date, default: null },
    status: { type: String, enum: PROJECT_STATUSES, default: 'Active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const Project = mongoose.model('Project', projectSchema);
