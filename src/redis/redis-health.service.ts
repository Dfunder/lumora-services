import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

@Injectable()
export class RedisHealthService {
  constructor(private readonly redisService: RedisService) {}

  async checkHealth(): Promise<{
    status: 'up' | 'down';
    info: any;
  }> {
    try {
      const pingResult = await this.redisService.ping();
      const client = this.redisService.getClient();
      
      return {
        status: 'up',
        info: {
          ping: pingResult,
          connected: client.status === 'ready',
          uptime: Date.now(),
        },
      };
    } catch (error) {
      return {
        status: 'down',
        info: {
          error: error.message,
        },
      };
    }
  }
}