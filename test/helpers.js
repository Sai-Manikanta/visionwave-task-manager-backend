import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://unused';
process.env.JWT_SECRET = 'test-secret';
process.env.TEAM_SIGNUP_CODE = 'test-code';
process.env.APP_TIMEZONE = 'Asia/Kolkata';

const { createApp } = await import('../src/app.js');

let memory;

export async function startDb() {
  memory = await MongoMemoryServer.create();
  await mongoose.connect(memory.getUri());
  await mongoose.connection.syncIndexes();
}

export async function stopDb() {
  await mongoose.disconnect();
  await memory.stop();
}

export const app = createApp();

export async function signUp(name = 'Asha') {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({
    name,
    email: `${name.toLowerCase()}-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'password123',
    signupCode: 'test-code',
  });
  return { agent, user: res.body.user };
}

export function taskBody(project, assignee, overrides = {}) {
  return {
    title: 'Build landing page',
    deadline: '2026-12-01',
    project,
    assignee,
    ...overrides,
  };
}

export async function createProject(agent, name = 'Website') {
  const res = await agent.post('/api/projects').send({ name });
  return res.body.project;
}
