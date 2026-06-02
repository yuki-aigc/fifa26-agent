/* ===========================================================
   FIFA26 预测系统 · 后端 API 入口 (Fastify)
   =========================================================== */
import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config.js';
import { registerRoutes } from './routes/index.js';

async function main() {
  const app = Fastify({ logger: { transport: undefined, level: 'info' } });

  await app.register(cors, { origin: true });
  await app.register(swagger, {
    openapi: {
      info: { title: 'FIFA26 预测 API', version: '1.0.0', description: 'Teams / Players / Matches / Predictions' },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    app.log.error(err);
    reply.code(err.statusCode ?? 500).send({ error: 'internal_error', message: err.message });
  });

  await registerRoutes(app);

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`🚀 API on http://${config.host}:${config.port}  ·  docs: /docs`);
}

main().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
