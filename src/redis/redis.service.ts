import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import redisConfig from '../config/redis.config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redis: Redis;

  constructor(
    @Inject(redisConfig.KEY)
    private readonly config: ConfigType<typeof redisConfig>,
  ) {
    this.redis = new Redis({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest,
      lazyConnect: this.config.lazyConnect,
      enableReadyCheck: this.config.enableReadyCheck,
      family: this.config.family,
      keepAlive: this.config.keepAlive,
      connectionName: this.config.connectionName,
    });
  }

  async onModuleInit() {
    try {
      await this.redis.connect();
      this.logger.log('Connected to Redis successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.redis.disconnect();
    this.logger.log('Disconnected from Redis');
  }

  getClient(): Redis {
    return this.redis;
  }

  async set(
    key: string,
    value: string | number | Buffer,
    ttl?: number,
  ): Promise<void> {
    if (ttl) {
      await this.redis.setex(key, ttl, value);
    } else {
      await this.redis.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return await this.redis.get(key);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.redis.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return await this.redis.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return await this.redis.hgetall(key);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    return await this.redis.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return await this.redis.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return await this.redis.smembers(key);
  }

  async ping(): Promise<string> {
    return await this.redis.ping();
  }

  /**
   * Set a key only if it does not already exist (atomic).
   * Returns true if the key was set, false if it already existed.
   */
  async setnx(
    key: string,
    value: string | number | Buffer,
    ttl?: number,
  ): Promise<boolean> {
    if (ttl) {
      const result = await this.redis.set(key, value, 'EX', ttl, 'NX');
      return result === 'OK';
    }
    const result = await this.redis.set(key, value, 'NX');
    return result === 'OK';
  }

  /**
   * Execute a WATCH/MULTI transaction for optimistic locking.
   * Returns null if the watched keys were modified (conflict).
   */
  async watchTransaction(
    keys: string[],
    operations: (
      multi: ReturnType<Redis['multi']>,
    ) => ReturnType<Redis['multi']>,
  ): Promise<Record<string, unknown>[] | null> {
    const watch = this.redis.watch(...keys);
    try {
      const multi = this.redis.multi();
      operations(multi);
      const results = await multi.exec();
      // exec() returns null when a watched key was modified
      if (results === null || results === undefined) {
        return null;
      }
      return results.map((result) => {
        const [err, value] = result as [Error | null, unknown];
        if (err) throw err;
        return value as Record<string, unknown>;
      });
    } catch (error) {
      throw error;
    } finally {
      await watch.unwatch();
    }
  }
}
