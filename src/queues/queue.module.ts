import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import bullConfig from '../config/bull.config';
import { QueueService } from './queue.service';
import { DlqService } from './dlq.service';
import { QueueMetricsService } from './metrics.service';
import { EmailProcessor } from './processors/email.processor';
import { ContractEventsProcessor } from './processors/contract-events.processor';
import { AnalyticsProcessor } from './processors/analytics.processor';

/** Primary queue names */
const EMAIL_QUEUE = 'email-queue';
const CONTRACT_EVENTS_QUEUE = 'contract-events-queue';
const ANALYTICS_QUEUE = 'analytics-queue';

/** Dead-letter queue names */
const EMAIL_DLQ = 'email-queue-dlq';
const CONTRACT_EVENTS_DLQ = 'contract-events-queue-dlq';
const ANALYTICS_DLQ = 'analytics-queue-dlq';

@Module({
  imports: [
    ConfigModule.forFeature(bullConfig),

    // ── Bull root configuration ──────────────────────────────────────────────
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: configService.get('bull.redis'),
        defaultJobOptions: configService.get('bull.defaultJobOptions'),
      }),
      inject: [ConfigService],
    }),

    // ── Primary queues ────────────────────────────────────────────────────────
    BullModule.registerQueueAsync(
      {
        name: EMAIL_QUEUE,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          defaultJobOptions: {
            ...configService.get('bull.defaultJobOptions'),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: CONTRACT_EVENTS_QUEUE,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          defaultJobOptions: {
            ...configService.get('bull.defaultJobOptions'),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: ANALYTICS_QUEUE,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          defaultJobOptions: {
            ...configService.get('bull.defaultJobOptions'),
          },
        }),
        inject: [ConfigService],
      },
    ),

    // ── Dead-letter queues ────────────────────────────────────────────────────
    // DLQ jobs are never retried automatically — they stay until replayed.
    BullModule.registerQueue(
      {
        name: EMAIL_DLQ,
        defaultJobOptions: { removeOnComplete: false, removeOnFail: false, attempts: 1 },
      },
      {
        name: CONTRACT_EVENTS_DLQ,
        defaultJobOptions: { removeOnComplete: false, removeOnFail: false, attempts: 1 },
      },
      {
        name: ANALYTICS_DLQ,
        defaultJobOptions: { removeOnComplete: false, removeOnFail: false, attempts: 1 },
      },
    ),

    // ── Bull Board – register all queues (primary + DLQ) for the dashboard ───
    BullBoardModule.forFeature(
      { name: EMAIL_QUEUE, adapter: BullAdapter },
      { name: CONTRACT_EVENTS_QUEUE, adapter: BullAdapter },
      { name: ANALYTICS_QUEUE, adapter: BullAdapter },
      { name: EMAIL_DLQ, adapter: BullAdapter },
      { name: CONTRACT_EVENTS_DLQ, adapter: BullAdapter },
      { name: ANALYTICS_DLQ, adapter: BullAdapter },
    ),
  ],

  providers: [
    // Services
    QueueMetricsService,
    DlqService,
    QueueService,
    // Processors
    EmailProcessor,
    ContractEventsProcessor,
    AnalyticsProcessor,
  ],

  exports: [
    QueueService,
    DlqService,
    QueueMetricsService,
    BullModule,
  ],
})
export class QueueModule {}
