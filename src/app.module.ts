import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queues/queue.module';
import { BullBoardConfigModule } from './bull-board/bull-board.module';
import { HealthModule } from './health/health.module';
import redisConfig from './config/redis.config';
import bullConfig from './config/bull.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [redisConfig, bullConfig],
    }),
    RedisModule,
    QueueModule,
    // Only load Bull Board in development
    ...(process.env.NODE_ENV !== 'production' ? [BullBoardConfigModule] : []),
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}