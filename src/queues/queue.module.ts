import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import bullConfig from '../config/bull.config';
import { QueueService } from './queue.service';
import { EmailProcessor } from './processors/email.processor';
import { ContractEventsProcessor } from './processors/contract-events.processor';
import { AnalyticsProcessor } from './processors/analytics.processor';

@Module({
  imports: [
    ConfigModule.forFeature(bullConfig),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: configService.get('bull.redis'),
        defaultJobOptions: configService.get('bull.defaultJobOptions'),
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      {
        name: 'email-queue',
      },
      {
        name: 'contract-events-queue',
      },
      {
        name: 'analytics-queue',
      },
    ),
  ],
  providers: [
    QueueService,
    EmailProcessor,
    ContractEventsProcessor,
    AnalyticsProcessor,
  ],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
