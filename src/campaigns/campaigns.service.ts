import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Donation } from '../entities/donation.entity';
import { Campaign } from '../entities/campaign.entity';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Donation)
    private readonly donationRepository: Repository<Donation>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
  ) {}

  async getCampaignStatistics(campaignId: number) {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const stats = await this.donationRepository
      .createQueryBuilder('donation')
      .select('SUM(donation.amount)', 'totalRaised')
      .addSelect('COUNT(DISTINCT donation.donorId)', 'donorCount')
      .addSelect('COUNT(DISTINCT donation.asset)', 'uniqueAssets')
      .addSelect('AVG(donation.amount)', 'avgDonation')
      .where('donation.campaignId = :campaignId', { campaignId })
      .getRawOne();

    const donationsPerDay = await this.donationRepository
      .createQueryBuilder('donation')
      .select("DATE(donation.createdAt, 'unixepoch')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('donation.campaignId = :campaignId', { campaignId })
      .andWhere('donation.createdAt >= :thirtyDaysAgo', { thirtyDaysAgo })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany();

    const topDonors = await this.donationRepository
      .createQueryBuilder('donation')
      .select('donation.donorId', 'donorId')
      .addSelect('SUM(donation.amount)', 'totalDonated')
      .where('donation.campaignId = :campaignId', { campaignId })
      .groupBy('donation.donorId')
      .orderBy('totalDonated', 'DESC')
      .limit(5)
      .getRawMany();

    return {
      ...stats,
      donationsPerDay,
      topDonors,
    };
  }
}
