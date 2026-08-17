import { AdminCampaignsController } from './admin.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { CampaignsController } from './campaign.controller';
import { CampaignsService } from './campaign.service';
import { Campaign } from './entities/campaign.entity';
import { CampaignDraft } from './entities/campaign-draft.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, CampaignDraft]),
    PrismaModule,
    BullModule.registerQueue({ name: 'analytics' }),
  ],
  controllers: [CampaignsController, AdminCampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignModule {}
