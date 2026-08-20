import { Controller, Get, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Server } from '@stellar/stellar-sdk';
import { RedisHealthService } from '../redis/redis-health.service';
import { QueueService } from '../queues/queue.service';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ContractEventStreamerService } from '../contract-event-streamer/contract-event-streamer.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly horizonServer: Server;

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    private readonly redisHealthService: RedisHealthService,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService,
    private readonly streamerService: ContractEventStreamerService,
  ) {
    const horizonUrl = this.configService.get<string>('HORIZON_URL') || 'https://horizon.stellar.org';
    this.horizonServer = new Server(horizonUrl);
  }

  @ApiOperation({ summary: 'Comprehensive health check of all services' })
  @ApiResponse({ status: 200, description: 'Health status returned' })
  @Get()
  async checkHealth() {
    const [postgresHealth, redisHealth, horizonHealth, queueStats, streamerStatus, deadLetterCount] =
      await Promise.all([
        this.checkPostgres(),
        this.redisHealthService.checkHealth(),
        this.checkHorizon(),
        this.queueService.getQueueStats(),
        this.streamerService.getStatus(),
        this.streamerService.getDeadLetterCount(),
      ]);

    const allUp =
      postgresHealth.status === 'up' &&
      redisHealth.status === 'up' &&
      horizonHealth.status === 'up' &&
      streamerStatus.running;

    return {
      status: allUp ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        postgres: postgresHealth,
        redis: redisHealth,
        horizon: horizonHealth,
        queues: {
          status: 'up',
          stats: queueStats,
        },
        contractStreamer: {
          status: streamerStatus.running ? 'up' : 'down',
          info: {
            running: streamerStatus.running,
            cursor: streamerStatus.cursor,
            lastLedger: streamerStatus.lastLedger,
            contractIds: streamerStatus.contractIds,
            pollingIntervalMs: streamerStatus.pollingIntervalMs,
            deadLetterCount,
          },
        },
      },
    };
  }

  @ApiOperation({ summary: 'Liveness probe - check if service is running' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  @Get('live')
  async checkLiveness() {
    return {
      status: 'live',
      timestamp: new Date().toISOString(),
    };
  }

  @ApiOperation({ summary: 'Readiness probe - check if all dependencies are ready' })
  @ApiResponse({ status: 200, description: 'All dependencies are ready' })
  @ApiResponse({ status: 503, description: 'Some dependencies are not ready' })
  @Get('ready')
  async checkReadiness() {
    const [postgresHealth, redisHealth, horizonHealth, streamerStatus] = await Promise.all([
      this.checkPostgres(),
      this.redisHealthService.checkHealth(),
      this.checkHorizon(),
      this.streamerService.getStatus(),
    ]);

    const allUp =
      postgresHealth.status === 'up' &&
      redisHealth.status === 'up' &&
      horizonHealth.status === 'up' &&
      streamerStatus.running;

    return {
      status: allUp ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      dependencies: {
        postgres: postgresHealth,
        redis: redisHealth,
        horizon: horizonHealth,
        contractStreamer: {
          status: streamerStatus.running ? 'up' : 'down',
          info: {
            running: streamerStatus.running,
            cursor: streamerStatus.cursor,
            lastLedger: streamerStatus.lastLedger,
          },
        },
      },
    };
  }

  @ApiOperation({ summary: 'Check Postgres database connectivity' })
  @ApiResponse({ status: 200, description: 'Postgres status returned' })
  @Get('postgres')
  async checkPostgres() {
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'up',
        info: {
          connected: this.dataSource.isInitialized,
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

  @ApiOperation({ summary: 'Check Redis connectivity' })
  @ApiResponse({ status: 200, description: 'Redis status returned' })
  @Get('redis')
  async checkRedis() {
    return await this.redisHealthService.checkHealth();
  }

  @ApiOperation({ summary: 'Check Stellar Horizon connectivity' })
  @ApiResponse({ status: 200, description: 'Horizon status returned' })
  @Get('horizon')
  async checkHorizon() {
    try {
      await this.horizonServer.serverRoot();
      return {
        status: 'up',
        info: {
          url: this.configService.get<string>('HORIZON_URL') || 'https://horizon.stellar.org',
          uptime: Date.now(),
        },
      };
    } catch (error) {
      return {
        status: 'down',
        info: {
          error: error.message,
          url: this.configService.get<string>('HORIZON_URL') || 'https://horizon.stellar.org',
        },
      };
    }
  }

  @ApiOperation({ summary: 'Check queue status' })
  @ApiResponse({ status: 200, description: 'Queue status returned' })
  @Get('queues')
  async checkQueues() {
    const stats = await this.queueService.getQueueStats();
    return {
      status: 'up',
      stats,
    };
  }

  @ApiOperation({ summary: 'Check contract event streamer status' })
  @ApiResponse({ status: 200, description: 'Streamer status returned' })
  @Get('contract-streamer')
  async checkContractStreamer() {
    const [status, deadLetterCount] = await Promise.all([
      this.streamerService.getStatus(),
      this.streamerService.getDeadLetterCount(),
    ]);

    return {
      status: status.running ? 'up' : 'down',
      info: {
        ...status,
        deadLetterCount,
      },
    };
  }
}