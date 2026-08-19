import { logger } from '../logger/logger';
import correlation from '../correlation/correlation.service';

export function logEvent(name: string, payload: Record<string, any>) {
  const ctx = correlation.get();
  logger.info('business.event', { event: name, payload, correlationId: ctx.correlationId, timestamp: new Date().toISOString() });
}

export default logEvent;
