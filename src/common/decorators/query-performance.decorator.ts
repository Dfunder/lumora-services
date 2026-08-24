import { logger } from '../logger/logger';
import correlation from '../correlation/correlation.service';

export interface QueryPerformanceOptions {
  logThreshold?: number; // milliseconds
  logSlowQueries?: boolean;
}

export function QueryPerformance(options: QueryPerformanceOptions = {}) {
  const {
    logThreshold = 100,
    logSlowQueries = true,
  } = options;

  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      const ctx = correlation.get();
      
      try {
        const result = await originalMethod.apply(this, args);
        const executionTime = Date.now() - startTime;

        if (logSlowQueries && executionTime > logThreshold) {
          logger.warn('query.performance.slow', {
            method: `${target.constructor.name}.${propertyKey}`,
            executionTime,
            threshold: logThreshold,
            correlationId: ctx.correlationId,
          });
        } else {
          logger.debug('query.performance.success', {
            method: `${target.constructor.name}.${propertyKey}`,
            executionTime,
            correlationId: ctx.correlationId,
          });
        }

        return result;
      } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.error('query.performance.error', {
          method: `${target.constructor.name}.${propertyKey}`,
          executionTime,
          error: error.message,
          correlationId: ctx.correlationId,
        });
        throw error;
      }
    };

    return descriptor;
  };
}