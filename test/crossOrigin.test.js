import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';

process.env.CLIENT_ORIGIN = 'https://tasks.example.com/';
const { app, startDb, stopDb } = await import('./helpers.js');

const ALLOWED = 'https://tasks.example.com';
const OTHER = 'https://evil.example.com';
const creds = { email: 'nobody@example.com', password: 'password123' };

before(startDb);
after(stopDb);

describe('cross-origin requests', () => {
  it('answers the preflight for an allowed origin', async () => {
    const res = await request(app).options('/api/auth/login').set('Origin', ALLOWED);
    assert.equal(res.status, 204);
    assert.equal(res.headers['access-control-allow-origin'], ALLOWED);
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
    assert.match(res.headers['access-control-allow-methods'], /DELETE/);
  });

  it('adds the headers to responses for an allowed origin, including errors', async () => {
    const res = await request(app).post('/api/auth/login').set('Origin', ALLOWED).send(creds);
    assert.equal(res.status, 401);
    assert.equal(res.headers['access-control-allow-origin'], ALLOWED);
  });

  it('refuses data changes from another origin', async () => {
    const res = await request(app).post('/api/auth/logout').set('Origin', OTHER);
    assert.equal(res.status, 403);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
    assert.equal(res.headers['set-cookie'], undefined);
  });

  it('gives another origin no access to read responses', async () => {
    const res = await request(app).get('/api/auth/me').set('Origin', OTHER);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  it('still accepts requests with no origin', async () => {
    const res = await request(app).post('/api/auth/login').send(creds);
    assert.equal(res.status, 401);
  });
});
