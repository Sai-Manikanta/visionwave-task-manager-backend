import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createProject, signUp, startDb, stopDb } from './helpers.js';
import { Task } from '../src/models/Task.js';
import { bucketFor, stateAt } from '../src/services/reports.js';
import { dayRange, weekRange } from '../src/utils/dates.js';

describe('date ranges', () => {
  it('uses IST day boundaries', () => {
    const { start, end } = dayRange('2026-10-30', 'Asia/Kolkata');
    assert.equal(start.toISOString(), '2026-10-29T18:30:00.000Z');
    assert.equal(end.toISOString(), '2026-10-30T18:30:00.000Z');
  });

  it('runs weeks Monday to Sunday, including from a Sunday', () => {
    assert.equal(weekRange('2026-10-30', 'Asia/Kolkata').first, '2026-10-26');
    const sunday = weekRange('2026-11-01', 'Asia/Kolkata');
    assert.equal(sunday.first, '2026-10-26');
    assert.equal(sunday.last, '2026-11-01');
    assert.equal(sunday.end.toISOString(), '2026-11-01T18:30:00.000Z');
  });

  it('crosses month and year ends', () => {
    const { first, last } = weekRange('2027-01-01', 'Asia/Kolkata');
    assert.equal(first, '2026-12-28');
    assert.equal(last, '2027-01-03');
  });
});

describe('task state on a past date', () => {
  const at = (iso) => new Date(iso);
  const task = {
    history: [
      { status: 'To Do', percent: 0, at: at('2026-10-26T04:00:00Z') },
      { status: 'In Progress', percent: 40, at: at('2026-10-27T04:00:00Z') },
      { status: 'Completed', percent: 100, at: at('2026-10-28T04:00:00Z') },
      { status: 'In Review', percent: 90, at: at('2026-10-29T04:00:00Z') },
    ],
  };

  it('reads the status as it was at the end of each day', () => {
    const on = (day) => {
      const { start, end } = dayRange(day, 'Asia/Kolkata');
      return bucketFor(stateAt(task, end), start);
    };
    assert.equal(on('2026-10-25'), null);
    assert.equal(on('2026-10-26'), 'pending');
    assert.equal(on('2026-10-27'), 'inProgress');
    assert.equal(on('2026-10-28'), 'completed');
    assert.equal(on('2026-10-29'), 'inReview');
  });

  it('leaves a task out once it was completed on an earlier day', () => {
    const finished = { history: task.history.slice(0, 3) };
    const { start, end } = dayRange('2026-10-29', 'Asia/Kolkata');
    assert.equal(bucketFor(stateAt(finished, end), start), null);
  });
});

describe('report endpoints', () => {
  let agent, user, project;

  before(async () => {
    await startDb();
    ({ agent, user } = await signUp('Reporter'));
    project = await createProject(agent, 'Reports');
  });
  after(stopDb);

  async function seed(title, completedAt) {
    return Task.create({
      title,
      deadline: new Date('2026-12-01T00:00:00Z'),
      project: project.id,
      assignee: user.id,
      createdBy: user.id,
      status: 'Completed',
      completionPercent: 100,
      completedAt: new Date(completedAt),
      createdAt: new Date('2026-10-01T00:00:00Z'),
      history: [
        { status: 'To Do', percent: 0, at: new Date('2026-10-01T00:00:00Z') },
        { status: 'Completed', percent: 100, at: new Date(completedAt) },
      ],
    });
  }

  it('puts a task completed at 00:30 IST on the correct day', async () => {
    // 00:30 IST on 28 Oct is still 27 Oct in UTC.
    await seed('Just after midnight', '2026-10-27T19:00:00Z');
    // 23:30 IST on 27 Oct.
    await seed('Just before midnight', '2026-10-27T18:00:00Z');

    const titles = async (date) =>
      (await agent.get('/api/reports/daily').query({ date })).body.report.tasks.completed.map((t) => t.title);
    assert.deepEqual(await titles('2026-10-28'), ['Just after midnight']);
    assert.deepEqual(await titles('2026-10-27'), ['Just before midnight']);
  });

  it('builds the weekly report, per-member counts and a Monday-first series', async () => {
    const { report } = (await agent.get('/api/reports/weekly').query({ date: '2026-10-30' })).body;
    assert.equal(report.first, '2026-10-26');
    assert.equal(report.last, '2026-11-01');
    assert.equal(report.totals.completed, 2);

    const member = report.members.find((m) => m.id === user.id);
    assert.equal(member.completed, 2);
    assert.equal(member.averagePercent, 100);

    assert.deepEqual(
      report.completedSeries.map((d) => [d.day, d.completed]).slice(0, 3),
      [['2026-10-26', 0], ['2026-10-27', 1], ['2026-10-28', 1]],
    );
  });

  it('does not count those tasks in the following week', async () => {
    const { report } = (await agent.get('/api/reports/weekly').query({ date: '2026-11-03' })).body;
    assert.equal(report.totals.completed, 0);
  });

  it('lists unassigned tasks under their own row', async () => {
    const created = await agent.post('/api/tasks').send({ title: 'Nobody yet', deadline: '2026-12-01' });
    assert.equal(created.status, 201);

    const { report } = (await agent.get('/api/reports/daily')).body;
    const row = report.members.find((m) => m.id === 'none');
    assert.equal(row.name, 'Unassigned');
    assert.equal(row.pending, 1);
    assert.ok(report.tasks.pending.some((t) => t.title === 'Nobody yet' && t.assignee === null));
  });

  it('rejects an invalid date', async () => {
    assert.equal((await agent.get('/api/reports/daily').query({ date: '2026-13-01' })).status, 400);
  });
});
