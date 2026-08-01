import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

/**
 * Health endpoint tests.
 *
 * No database connection is made here — the test verifies that the endpoint
 * works and correctly reports the DB as disconnected when Mongoose is not
 * connected.
 */
describe('GET /api/health', () => {
  it('responds with HTTP 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('returns status: ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.status).toBe('ok');
  });

  it('includes timestamp, version, and db fields', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('db');
  });

  it('reports db as disconnected when Mongoose is not connected', async () => {
    const res = await request(app).get('/api/health');
    // Mongoose readyState is 0 in tests — no connection was established
    expect(res.body.db).toBe('disconnected');
  });

  it('timestamp is a valid ISO-8601 string', async () => {
    const res = await request(app).get('/api/health');
    const ts = new Date(res.body.timestamp as string);
    expect(ts.getTime()).not.toBeNaN();
  });
});

describe('GET /api/nonexistent', () => {
  it('returns 404 with JSON body', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
