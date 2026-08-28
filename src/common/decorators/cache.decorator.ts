import { RedisService } from '../../redis/redis.service';
import { logger } from '../logger/logger';
import correlation from '../correlation/correlation.service';

export interface CacheOptions {
  key: string | ((...args: any[]) => string);
  ttl?: number;
  fallbackToOriginal?: boolean;
}

export function CacheKey(options: CacheOptions) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const redisService: RedisService = (this as any).redisService;
      if (!redisService) {
        return originalMethod.apply(this, args);
      }

      const cacheKey = typeof options.key === 'function' 
        ? options.key(...args) 
        : options.key;
      
      try {
        const cached = await redisService.get(cacheKey);
        if (cached) {
          try {
            return JSON.parse(cached);
          } catch (parseError) {
            logger.warn('cache.parseError', {
              cacheKey,
              error: parseError.message,
              correlationId: correlation.get().correlationId,
            });
          }
        }
      } catch (redisError) {
        logger.warn('cache.getFailed', {
          cacheKey,
          error: redisError.message,
          correlationId: correlation.get().correlationId,
        });
        if (options.fallbackToOriginal !== false) {
          return originalMethod.apply(this, args);
        }
      }

      try {
        const result = await originalMethod.apply(this, args);
        
        if (result !== undefined && result !== null) {
          try {
            await redisService.set(cacheKey, JSON.stringify(result), options.ttl || 300);
          } catch (setError) {
            logger.warn('cache.setFailed', {
              cacheKey,
              error: setError.message,
              correlationId: correlation.get().correlationId,
            });
          }
        }

        return result;
      } catch (methodError) {
        logger.error('cache.methodFailed', {
          method: `${target.constructor.name}.${propertyKey}`,
          error: methodError.message,
          correlationId: correlation.get().correlationId,
        });
        throw methodError;
      }
    };

    return descriptor;
  };
}

export function CacheInvalidate(pattern: string | ((...args: any[]) => string)) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const redisService: RedisService = (this as any).redisService;
      const result = await originalMethod.apply(this, args);

      if (redisService) {
        const invalidatePattern = typeof pattern === 'function'
          ? pattern(...args)
          : pattern;
        
        try {
          const keys = await redisService.getClient().keys(invalidatePattern);
          if (keys.length > 0) {
            await redisService.getClient().del(...keys);
            logger.debug('cache.invalidated', {
              pattern: invalidatePattern,
              keysCount: keys.length,
              correlationId: correlation.get().correlationId,
            });
          }
        } catch (error) {
          logger.error('cache.invalidationFailed', {
            pattern: invalidatePattern,
            error: error.message,
            correlationId: correlation.get().correlationId,
          });
        }
      }

      return result;
    };

    return descriptor;
  };
}