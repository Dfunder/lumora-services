import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import redisConfig from '../config/redis.config';
import { logger } from '../common/logger/logger';
import correlation from '../common/correlation/correlation.service';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  // use centralized structured logger
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
      const ctx = correlation.get();
      logger.info('redis.connected', { correlationId: ctx.correlationId, msg: 'Connected to Redis successfully' });
    } catch (error) {
      const ctx = correlation.get();
      logger.error('redis.connect_failure', { correlationId: ctx.correlationId, error });
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.redis.disconnect();
    const ctx = correlation.get();
    logger.info('redis.disconnected', { correlationId: ctx.correlationId, msg: 'Disconnected from Redis' });
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
}
