/* ===========================================================
   FIFA26 预测系统 · 后端 API 入口 (Fastify)
   =========================================================== */
import Fastify, { type FastifyError } from 'fastify';
import { pathToFileURL } from 'node:url';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config.js';
import { sqlite } from './db/client.js';
import { registerRoutes } from './routes/index.js';
import { startScheduler } from './ingest/scheduler.js';
import { logger } from './observability/logger.js';
import { recordHttpRequest } from './observability/metrics.js';
import { trackError } from './observability/errorTracker.js';

const requestStartedAt = new WeakMap<object, number>();

export async function buildApp() {
  const app = Fastify({ logger: { transport: undefined, level: process.env.LOG_LEVEL ?? 'info' } });

  await app.register(cors, { origin: true });
  await app.register(swagger, {
    openapi: {
      info: { title: 'FIFA26 预测 API', version: '1.0.0', description: 'Teams / Players / Matches / Predictions' },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.addHook('onRequest', async (request) => {
    requestStartedAt.set(request, Date.now());
  });

  app.addHook('onResponse', async (request, reply) => {
    const durationMs = Date.now() - (requestStartedAt.get(request) ?? Date.now());
    const route = request.routeOptions.url ?? request.url;
    recordHttpRequest(request.method, route, reply.statusCode, durationMs);
    logger.info(
      { method: request.method, route, statusCode: reply.statusCode, durationMs },
      'http_request',
    );
  });

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    app.log.error(err);
    trackError(err, {
      module: 'routes',
      method: _req.method,
      route: _req.routeOptions.url ?? _req.url,
      statusCode: err.statusCode ?? 500,
    });
    reply.code(err.statusCode ?? 500).send({ error: 'internal_error', message: err.message });
  });

  await registerRoutes(app);
  return app;
}

async function main() {
  const app = await buildApp();

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`🚀 API on http://${config.host}:${config.port}  ·  docs: /docs`);

  startScheduler(app.log); // 赛事期间的实时数据定时拉取 (SYNC_ENABLED)

  const shutdown = async () => {
    await app.close();
    sqlite.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) {
  main().catch((err) => {
    console.error('启动失败:', err);
    process.exit(1);
  });
}
