import pino from 'pino';

const isDev = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: pino.stdTimeFunctions.epochTime,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      }
    : undefined,
});

export const firoLogger = logger.child({ module: 'firo' });
export const aiLogger = logger.child({ module: 'ai' });
export const routeLogger = logger.child({ module: 'routes' });
export const ingestLogger = logger.child({ module: 'ingest' });
export const healthLogger = logger.child({ module: 'health' });
