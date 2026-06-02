import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';
import { resetMetricsForTest } from '../observability/metrics.js';

describe('routes observability', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    resetMetricsForTest();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns health status with database and config checks', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checks.database).toBe('ok');
    expect(body.checks).toHaveProperty('firoConfigured');
    expect(body.checks).toHaveProperty('aiConfigured');
  });

  it('exposes in-memory metrics and includes injected requests', async () => {
    await app.inject({ method: 'GET', url: '/health' });
    const res = await app.inject({ method: 'GET', url: '/api/metrics' });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.http_requests_total['GET /health:200']).toBe(1);
    expect(body).toHaveProperty('memory_rss_mb');
    expect(body).toHaveProperty('firo_requests_total');
  });

  it('does not call Firo when lottery credentials are missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/lottery/matches' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('firo_not_configured');
  });
});
