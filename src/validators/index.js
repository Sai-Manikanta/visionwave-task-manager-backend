import { z } from 'zod';
import mongoose from 'mongoose';
import { PRIORITIES, PROJECT_STATUSES, TASK_STATUSES, UNASSIGNED } from '../config/constants.js';
import { sanitizeRichText } from '../utils/richText.js';

const objectId = z
  .string()
  .refine((value) => mongoose.isObjectIdOrHexString(value), 'Please choose a valid option.');

const isRealDay = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};
const day = z.string().refine(isRealDay, 'Enter a valid date.');

const percent = z.number().int().min(0).max(100);
const richText = z.string().max(50000, 'This text is too long.').transform(sanitizeRichText);

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(100),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  password: z
    .string()
    .min(8, 'Use at least 8 characters.')
    .max(72, 'Use at most 72 characters.'),
  signupCode: z.string().min(1, 'Enter the team signup code.').max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  password: z.string().min(1, 'Enter your password.').max(200),
});

const projectFields = {
  name: z.string().trim().min(1, 'Enter a project name.').max(150),
  description: richText,
  deadline: day.nullable(),
  status: z.enum(PROJECT_STATUSES, 'Choose a status.'),
};

export const projectCreateSchema = z.object({
  ...projectFields,
  description: projectFields.description.default(''),
  deadline: projectFields.deadline.default(null),
  status: projectFields.status.default('Active'),
});
export const projectUpdateSchema = z.object(projectFields).partial();

const taskFields = {
  title: z.string().trim().min(1, 'Enter a task title.').max(200),
  description: richText,
  priority: z.enum(PRIORITIES, 'Choose a priority.'),
  deadline: day,
  project: objectId.nullable(),
  assignee: objectId.nullable(),
  status: z.enum(TASK_STATUSES, 'Choose a status.'),
  completionPercent: percent,
  finalSummary: richText,
};

export const taskCreateSchema = z.object({
  ...taskFields,
  project: taskFields.project.default(null),
  assignee: taskFields.assignee.default(null),
  description: taskFields.description.default(''),
  priority: taskFields.priority.default('Medium'),
  status: taskFields.status.default('To Do'),
  completionPercent: percent.default(0),
  finalSummary: taskFields.finalSummary.default(''),
});
export const taskUpdateSchema = z.object(taskFields).partial();

export const taskUpdateEntrySchema = z.object({
  text: z.string().trim().min(1, 'Write a short update.').max(5000),
  percent: percent.optional(),
});

export const taskCompleteSchema = z.object({
  finalSummary: richText.pipe(z.string().min(1, 'Add a final summary.')),
});

const emptyToUndefined = (value) => (value === '' ? undefined : value);
const optionalQuery = (schema) => z.preprocess(emptyToUndefined, schema.optional());

export const taskQuerySchema = z.object({
  q: optionalQuery(z.string().trim().max(200)),
  project: optionalQuery(z.union([z.literal('none'), objectId])),
  assignee: optionalQuery(z.union([z.literal(UNASSIGNED), objectId])),
  status: optionalQuery(z.enum(TASK_STATUSES)),
  deadlineFrom: optionalQuery(day),
  deadlineTo: optionalQuery(day),
  overdue: optionalQuery(z.enum(['true', 'false'])),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const reportQuerySchema = z.object({
  date: optionalQuery(day),
});
