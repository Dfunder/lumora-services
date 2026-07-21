import { Controller, Get } from '@nestjs/common';
import { RedisHealthService } from '../redis/redis-health.service';
import { QueueService } from '../queues/queue.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly redisHealthService: RedisHealthService,
    private readonly queueService: QueueService,
  ) {}

  @Get()
  async checkHealth() {
    const redisHealth = await this.redisHealthService.checkHealth();
    const queueStats = await this.queueService.getQueueStats();

    return {
      status: redisHealth.status === 'up' ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        redis: redisHealth,
        queues: {
          status: 'up',
          stats: queueStats,
        },
      },
    };
  }

  @Get('redis')
  async checkRedis() {
    return await this.redisHealthService.checkHealth();
  }

  @Get('queues')
  async checkQueues() {
    const stats = await this.queueService.getQueueStats();
    return {
      status: 'up',
      stats,
    };
  }
}
