import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { logger } from '../../common/logger/logger';
import correlation from '../../common/correlation/correlation.service';

@Processor('analytics')
export class AnalyticsProcessor {
  constructor(private readonly prisma: PrismaService) {}

  @Process('increment-view-count')
  async handleIncrementViewCount(job: Job<{ campaignId: string; _meta?: { correlationId?: string } }>) {
    const { campaignId } = job.data;
    const corrId = job.data._meta?.correlationId;
    // propagate correlation id into this async context
    correlation.run({ correlationId: corrId }, async () => {
      logger.info('processor.start', { processor: 'analytics.increment-view-count', campaignId, correlationId: corrId });
      try {
        await this.prisma.campaign.update({
          where: { id: campaignId },
          data: { viewCount: { increment: 1 } },
        });
        logger.info('processor.complete', { processor: 'analytics.increment-view-count', campaignId, correlationId: corrId });
      } catch (err) {
        logger.error('processor.error', { processor: 'analytics.increment-view-count', campaignId, error: err, correlationId: corrId });
        throw err;
      }
    });
  }
}
