import { COMPLETED } from '../config/constants.js';

// Works out the status, percent and completedAt a change leads to, keeping them consistent.
export function resolveProgress(current, change, now = new Date()) {
  const status = change.status ?? current.status;
  let percent = change.completionPercent ?? current.completionPercent;
  let completedAt = current.completedAt ?? null;

  if (status === COMPLETED) {
    percent = 100;
    if (current.status !== COMPLETED) completedAt = now;
  } else {
    completedAt = null;
    // A reopened task still has work left, so it can't stay at 100%.
    if (current.status === COMPLETED && percent === 100) percent = 90;
  }
  return { status, percent, completedAt };
}

// Applies a status or percent change to a task document and records it in the history.
export function applyProgress(task, change, now = new Date()) {
  const previousStatus = task.status;
  const previousPercent = task.completionPercent;
  const next = resolveProgress(task, change, now);

  task.status = next.status;
  task.completionPercent = next.percent;
  task.completedAt = next.completedAt;

  const changed = next.status !== previousStatus || next.percent !== previousPercent;
  if (changed) task.history.push({ status: next.status, percent: next.percent, at: now });
  return { statusChanged: next.status !== previousStatus, changed };
}
