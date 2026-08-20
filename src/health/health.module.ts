import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ContractEventStreamerModule } from '../contract-event-streamer/contract-event-streamer.module';

@Module({
  imports: [ContractEventStreamerModule],
  controllers: [HealthController],
})
export class HealthModule {}
