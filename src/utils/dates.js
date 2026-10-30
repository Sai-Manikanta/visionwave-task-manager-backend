import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { env } from '../config/env.js';

// Calendar days travel as 'yyyy-MM-dd' strings. Day arithmetic runs in UTC so it
// never depends on the server's own timezone.
export function today(timezone = env.timezone) {
  return formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
}

export function addDays(day, count) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

// The instants a calendar day covers in the team's timezone: [start, end).
export function dayRange(day, timezone = env.timezone) {
  return {
    start: fromZonedTime(`${day}T00:00:00`, timezone),
    end: fromZonedTime(`${addDays(day, 1)}T00:00:00`, timezone),
  };
}

export function weekStart(day) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

// The Monday-to-Sunday week containing the given day.
export function weekRange(day, timezone = env.timezone) {
  const first = weekStart(day);
  const last = addDays(first, 6);
  return {
    first,
    last,
    start: dayRange(first, timezone).start,
    end: dayRange(last, timezone).end,
  };
}

// Task and project deadlines are calendar dates, stored at UTC midnight.
export function deadlineToDate(day) {
  return new Date(`${day}T00:00:00Z`);
}

export function deadlineToDay(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}
