import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queues/queue.module';
import { BullBoardConfigModule } from './bull-board/bull-board.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { User } from './auth/entities/user.entity';
import redisConfig from './config/redis.config';
import bullConfig from './config/bull.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [redisConfig, bullConfig],
    }),
    TypeOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [User],
        synchronize: config.get<string>('NODE_ENV') !== 'production',
      }),
      inject: [ConfigService],
    }),
    RedisModule,
    QueueModule,
    // Only load Bull Board in development
    ...(process.env.NODE_ENV !== 'production' ? [BullBoardConfigModule] : []),
    HealthModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
