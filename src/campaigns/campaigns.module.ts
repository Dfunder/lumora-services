import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { Donation } from '../entities/donation.entity';
import { Campaign } from '../entities/campaign.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Donation, Campaign])],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
