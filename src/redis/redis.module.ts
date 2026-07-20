import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './redis.service';
import { RedisHealthService } from './redis-health.service';
import redisConfig from '../config/redis.config';
@Global()
@Module({
  imports: [ConfigModule.forFeature(redisConfig)],
  providers: [RedisService, RedisHealthService],
  exports: [RedisService, RedisHealthService],
})
export class RedisModule {}
