import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';

@Processor('analytics')
export class AnalyticsProcessor {
  constructor(private readonly prisma: PrismaService) {}

  @Process('increment-view-count')
  async handleIncrementViewCount(job: Job<{ campaignId: string }>) {
    const { campaignId } = job.data;
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { viewCount: { increment: 1 } },
    });
  }
}
