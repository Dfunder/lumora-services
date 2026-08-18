import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { logger } from '../common/logger/logger';
import correlation from '../common/correlation/correlation.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();

    // Prisma middleware to capture query durations
    this.$use(async (params, next) => {
      const start = Date.now();
      const result = await next(params);
      const duration = Date.now() - start;
      try {
        const ctx = correlation.get();
        if (duration > 100) {
          logger.warn('prisma.slow_query', {
            model: params.model,
            action: params.action,
            duration,
            params: params.args,
            correlationId: ctx.correlationId,
            userId: ctx.userId,
          });
        }
      } catch (e) {
        // ignore logging failure
      }
      return result;
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
