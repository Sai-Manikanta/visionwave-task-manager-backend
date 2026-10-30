import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { app, createProject, signUp, startDb, stopDb, taskBody } from './helpers.js';

before(startDb);
after(stopDb);

describe('auth', () => {
  it('rejects a wrong signup code', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'X', email: 'x@example.com', password: 'password123', signupCode: 'wrong',
    });
    assert.equal(res.status, 403);
  });

  it('registers, never returns the hash, and logs in', async () => {
    const creds = { email: 'login@example.com', password: 'password123' };
    const reg = await request(app).post('/api/auth/register').send({ ...creds, name: 'L', signupCode: 'test-code' });
    assert.equal(reg.status, 201);
    assert.equal(reg.body.user.passwordHash, undefined);

    assert.equal((await request(app).post('/api/auth/login').send({ ...creds, password: 'nope' })).status, 401);
    const login = await request(app).post('/api/auth/login').send(creds);
    assert.equal(login.status, 200);
    const cookie = login.headers['set-cookie'][0];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
  });

  it('rejects a duplicate email regardless of case', async () => {
    const body = { name: 'D', email: 'Dup@Example.com', password: 'password123', signupCode: 'test-code' };
    assert.equal((await request(app).post('/api/auth/register').send(body)).status, 201);
    const again = await request(app).post('/api/auth/register').send({ ...body, email: 'dup@example.com' });
    assert.equal(again.status, 409);
  });

  it('blocks the API without a session', async () => {
    for (const path of ['/api/tasks', '/api/projects', '/api/users', '/api/dashboard', '/api/reports/daily']) {
      assert.equal((await request(app).get(path)).status, 401, path);
    }
  });

  it('rejects operator objects as login input', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: { $ne: null }, password: 'x' });
    assert.equal(res.status, 400);
  });
});

describe('tasks', () => {
  let agent, user, project;
  before(async () => {
    ({ agent, user } = await signUp('Tasker'));
    project = await createProject(agent);
  });

  it('validates input and returns field errors', async () => {
    const res = await agent.post('/api/tasks').send(taskBody(project.id, user.id, {
      title: ' ', deadline: '2026-02-31',
    }));
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.title);
    assert.ok(res.body.fields.deadline);
  });

  it('lets a teammate find an unassigned task and take it', async () => {
    const created = await agent.post('/api/tasks').send(taskBody(project.id, null, { title: 'Open task' }));
    assert.equal(created.status, 201);
    assert.equal(created.body.task.assignee, null);

    const open = await agent.get('/api/tasks').query({ assignee: 'none' });
    assert.ok(open.body.tasks.some((t) => t.title === 'Open task'));
    assert.ok(open.body.tasks.every((t) => t.assignee === null));
    assert.ok((await agent.get('/api/dashboard')).body.cards.unassigned >= 1);

    const taken = await agent.put(`/api/tasks/${created.body.task.id}`).send({ assignee: user.id });
    assert.equal(taken.body.task.assignee.id, user.id);
    assert.equal(taken.body.task.updates[0].text, 'Assigned to Tasker.');

    const released = await agent.put(`/api/tasks/${created.body.task.id}`).send({ assignee: null });
    assert.equal(released.body.task.assignee, null);
    assert.equal(released.body.task.updates[0].text, 'Marked as unassigned.');
  });

  it('allows a task without a project, and filters for those tasks', async () => {
    const { project: _unused, ...body } = taskBody(null, user.id, { title: 'Learn Rust' });
    const created = await agent.post('/api/tasks').send(body);
    assert.equal(created.status, 201);
    assert.equal(created.body.task.project, null);

    const list = await agent.get('/api/tasks').query({ project: 'none' });
    assert.ok(list.body.tasks.some((t) => t.title === 'Learn Rust'));
    assert.ok(list.body.tasks.every((t) => t.project === null));

    const assigned = await agent.put(`/api/tasks/${created.body.task.id}`).send({ project: project.id });
    assert.equal(assigned.body.task.project.id, project.id);
    const cleared = await agent.put(`/api/tasks/${created.body.task.id}`).send({ project: null });
    assert.equal(cleared.body.task.project, null);

    const report = await agent.get('/api/reports/daily');
    assert.ok(report.body.report.tasks.pending.some((t) => t.title === 'Learn Rust' && t.project === null));
  });

  it('rejects references to records that do not exist', async () => {
    const missing = '64b000000000000000000000';
    const res = await agent.post('/api/tasks').send(taskBody(missing, missing));
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.project);
    assert.ok(res.body.fields.assignee);
  });

  it('keeps status and percent in sync through completion and reopening', async () => {
    const { body } = await agent.post('/api/tasks').send(taskBody(project.id, user.id));
    const url = `/api/tasks/${body.task.id}`;

    const hundred = await agent.put(url).send({ completionPercent: 100 });
    assert.equal(hundred.body.task.status, 'To Do');
    assert.equal(hundred.body.task.completedAt, null);

    const noSummary = await agent.put(url).send({ status: 'Completed' });
    assert.equal(noSummary.status, 400);
    assert.ok(noSummary.body.fields.finalSummary);
    assert.equal((await agent.post(`${url}/complete`).send({})).status, 400);
    const blank = await agent.post(`${url}/complete`).send({ finalSummary: '<p> </p>' });
    assert.equal(blank.status, 400);
    assert.ok(blank.body.fields.finalSummary);

    const done = await agent.post(`${url}/complete`).send({
      finalSummary: '<p><strong>Shipped</strong> <a href="https://github.com/x/y">repo</a><script>alert(1)</script></p>',
    });
    assert.match(done.body.task.finalSummary, /<strong>Shipped<\/strong>/);
    assert.match(done.body.task.finalSummary, /href="https:\/\/github.com\/x\/y"/);
    assert.doesNotMatch(done.body.task.finalSummary, /script/);
    assert.equal(done.body.task.status, 'Completed');
    assert.equal(done.body.task.completionPercent, 100);
    assert.ok(done.body.task.completedAt);

    const lowered = await agent.put(url).send({ completionPercent: 20 });
    assert.equal(lowered.body.task.completionPercent, 100);

    const reopened = await agent.put(url).send({ status: 'In Review' });
    assert.equal(reopened.body.task.completionPercent, 90);
    assert.equal(reopened.body.task.completedAt, null);
  });

  it('adds progress updates with a percent', async () => {
    const { body } = await agent.post('/api/tasks').send(taskBody(project.id, user.id));
    const res = await agent.post(`/api/tasks/${body.task.id}/updates`).send({ text: 'Halfway', percent: 50 });
    assert.equal(res.status, 201);
    assert.equal(res.body.task.completionPercent, 50);
    assert.equal(res.body.task.updates[0].author.name, 'Tasker');
  });

  it('filters by search, status and overdue, treating search text literally', async () => {
    const { agent: a, user: u } = await signUp('Filter');
    const p = await createProject(a, 'Filtered');
    await a.post('/api/tasks').send(taskBody(p.id, u.id, { title: 'Fix (login) bug', deadline: '2020-01-01' }));
    await a.post('/api/tasks').send(taskBody(p.id, u.id, { title: 'Write docs', status: 'In Progress' }));

    const titles = async (query) =>
      (await a.get('/api/tasks').query({ project: p.id, ...query })).body.tasks.map((t) => t.title);
    assert.deepEqual(await titles({ q: '(login)' }), ['Fix (login) bug']);
    assert.deepEqual(await titles({ status: 'In Progress' }), ['Write docs']);
    assert.deepEqual(await titles({ overdue: 'true' }), ['Fix (login) bug']);
    assert.deepEqual(await titles({ deadlineFrom: '2026-01-01', deadlineTo: '2026-12-31' }), ['Write docs']);
  });

  it('returns 404 for a malformed or unknown id', async () => {
    assert.equal((await agent.get('/api/tasks/not-an-id')).status, 404);
    assert.equal((await agent.get('/api/tasks/64b000000000000000000000')).status, 404);
  });
});

describe('projects', () => {
  it('reports progress as the average of its tasks and guards deletion', async () => {
    const { agent, user } = await signUp('Projects');
    const project = await createProject(agent, 'Progress');
    assert.equal(project.progress, 0);

    const a = (await agent.post('/api/tasks').send(taskBody(project.id, user.id))).body.task;
    const b = (await agent.post('/api/tasks').send(taskBody(project.id, user.id))).body.task;
    await agent.put(`/api/tasks/${a.id}`).send({ completionPercent: 25 });
    await agent.post(`/api/tasks/${b.id}/complete`).send({ finalSummary: 'Done' });

    const { body } = await agent.get(`/api/projects/${project.id}`);
    assert.equal(body.project.progress, 63);
    assert.equal(body.project.taskCount, 2);
    assert.equal(body.project.completedCount, 1);

    assert.equal((await agent.delete(`/api/projects/${project.id}`)).status, 409);
    await agent.delete(`/api/tasks/${a.id}`);
    await agent.delete(`/api/tasks/${b.id}`);
    assert.equal((await agent.delete(`/api/projects/${project.id}`)).status, 200);
  });

  it('has no type or URL fields', async () => {
    const { agent } = await signUp('Fields');
    const res = await agent.post('/api/projects').send({ name: 'Plain', type: 'Website', url: 'https://x.com' });
    assert.equal(res.status, 201);
    assert.equal(res.body.project.type, undefined);
    assert.equal(res.body.project.url, undefined);
  });

  it('keeps description formatting and links but removes unsafe content', async () => {
    const { agent } = await signUp('Rich');
    const { body } = await agent.post('/api/projects').send({
      name: 'Rich',
      description:
        '<p onclick="x()"><strong>Bold</strong> <a href="https://x.com">site</a> <a href="javascript:alert(1)">bad</a></p><script>alert(1)</script><img src=x onerror=alert(1)>',
    });
    const html = body.project.description;
    assert.match(html, /<strong>Bold<\/strong>/);
    assert.match(html, /<a href="https:\/\/x\.com" target="_blank" rel="noopener noreferrer">site<\/a>/);
    for (const unsafe of ['script', 'onclick', 'javascript:', 'onerror', '<img']) {
      assert.ok(!html.includes(unsafe), unsafe);
    }
  });

  it('stores an empty editor as an empty description', async () => {
    const { agent } = await signUp('Empty');
    const { body } = await agent.post('/api/projects').send({ name: 'Empty', description: '<p></p>' });
    assert.equal(body.project.description, '');
  });
});

describe('dashboard', () => {
  it('counts a task completed now as completed today', async () => {
    const { agent, user } = await signUp('Dash');
    const initial = (await agent.get('/api/dashboard')).body.cards;
    const project = await createProject(agent, 'Dash');

    const { body } = await agent.post('/api/tasks').send(taskBody(project.id, user.id));
    await agent.post(`/api/tasks/${body.task.id}/complete`).send({ finalSummary: 'Done' });

    const { cards, recentUpdates } = (await agent.get('/api/dashboard')).body;
    assert.equal(cards.completedToday, initial.completedToday + 1);
    assert.equal(cards.activeProjects, initial.activeProjects + 1);
    assert.equal(recentUpdates[0].taskTitle, 'Build landing page');
  });
});
