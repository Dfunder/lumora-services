import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampaignsController } from './campaign.controller';
import { CampaignsService } from './campaign.service';
import { Campaign } from './entities/campaign.entity';
import { CampaignDraft } from './entities/campaign-draft.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Campaign, CampaignDraft])],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignModule {}
