import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContractEventStreamerService } from './contract-event-streamer.service';
import sorobanConfig from '../config/soroban.config';
import { QueueModule } from '../queues/queue.module';

@Module({
  imports: [
    ConfigModule.forFeature(sorobanConfig),
    QueueModule,
  ],
  providers: [ContractEventStreamerService],
  exports: [ContractEventStreamerService],
})
export class ContractEventStreamerModule {}
