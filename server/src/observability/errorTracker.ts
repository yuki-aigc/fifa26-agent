import { logger } from './logger.js';
import { recordTrackedError } from './metrics.js';

export interface ErrorContext {
  module?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  matchId?: number;
}

export function trackError(err: unknown, context: ErrorContext = {}): void {
  recordTrackedError();
  const error = err instanceof Error ? err : new Error(String(err));
  logger.error(
    {
      ...context,
      err: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    },
    'tracked_error',
  );
}
