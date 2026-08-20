import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDonationDto } from './dto/create-donation.dto';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class DonationService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('analytics') private readonly analyticsQueue: Queue,
  ) {}

  async submitDonation(dto: CreateDonationDto) {
    const hasTip = dto.tipAmount !== undefined || dto.tipAsset !== undefined;
    if (hasTip && (!dto.tipAmount || !dto.tipAsset)) {
      throw new BadRequestException(
        'tipAmount and tipAsset must be provided together when a tip is submitted.',
      );
    }

    if (dto.tipAmount !== undefined && Number(dto.tipAmount) <= 0) {
      throw new BadRequestException('tipAmount must be greater than zero.');
    }

    if (dto.tipAmount && dto.tipAsset) {
      await this.prisma.platformTip.create({
        data: {
          senderId: dto.walletAddress,
          recipientId: dto.campaignId ?? 'platform',
          amount: dto.tipAmount,
          currency: dto.tipAsset,
          transactionHash: dto.transactionHash,
          message: dto.message,
        },
      });
    }

    return { success: true };
  }

  async getCampaignDonations(
    campaignId: string,
    query: {
      page?: number;
      limit?: number;
      sortBy?: string;
      order?: 'asc' | 'desc';
    },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const allowedSortFields = ['amount', 'createdAt'];
    const sortBy = allowedSortFields.includes(query.sortBy ?? '')
      ? query.sortBy!
      : 'amount';
    const order = query.order?.toLowerCase() === 'asc' ? 'asc' : 'desc';

    const [total, items] = await Promise.all([
      this.prisma.donation.count({
        where: { campaignId, status: 'COMPLETED' },
      }),
      this.prisma.donation.findMany({
        where: { campaignId, status: 'COMPLETED' },
        orderBy: { [sortBy]: order },
        skip,
        take: limit,
        include: {
          donor: {
            select: {
              id: true,
              displayName: true,
              walletAddress: true,
              avatarUrl: true,
            },
          },
        },
      }),
    ]);

    const sanitizedItems = items.map((donation) => {
      if (donation.isAnonymous) {
        return {
          id: donation.id,
          campaignId: donation.campaignId,
          amount: donation.amount,
          currency: donation.currency,
          status: donation.status,
          transactionHash: donation.transactionHash,
          message: donation.message,
          isAnonymous: true,
          createdAt: donation.createdAt,
          donor: {
            displayName: 'Anonymous',
            walletAddress: 'Anonymous',
          },
        };
      }
      return donation;
    });

    return {
      data: sanitizedItems,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserDonations(
    userId: string,
    query: {
      startDate?: string;
      endDate?: string;
      campaignId?: string;
      sortBy?: string;
      order?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = { donorId: userId };

    if (query.campaignId) {
      where.campaignId = query.campaignId;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    const allowedSortFields = ['createdAt', 'amount'];
    const sortBy = allowedSortFields.includes(query.sortBy ?? '')
      ? query.sortBy!
      : 'createdAt';
    const order = query.order?.toLowerCase() === 'asc' ? 'asc' : 'desc';

    const [total, items] = await Promise.all([
      this.prisma.donation.count({ where }),
      this.prisma.donation.findMany({
        where,
        orderBy: { [sortBy]: order },
        skip,
        take: limit,
        include: {
          campaign: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async exportUserDonationsCsv(
    userId: string,
    query: {
      startDate?: string;
      endDate?: string;
      campaignId?: string;
      queueAsync?: boolean;
      userEmail?: string;
    },
  ): Promise<{ csv?: string; queued?: boolean; jobId?: string }> {
    const where: any = { donorId: userId };

    if (query.campaignId) {
      where.campaignId = query.campaignId;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    const count = await this.prisma.donation.count({ where });

    if (count > 5000 || query.queueAsync) {
      const job = await this.analyticsQueue.add('export-donations-csv', {
        userId,
        query,
        userEmail: query.userEmail,
      });
      return { queued: true, jobId: String(job.id) };
    }

    const donations = await this.prisma.donation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        campaign: {
          select: {
            title: true,
          },
        },
      },
    });

    const headers = ['Campaign', 'Amount', 'Asset', 'Date', 'TxHash', 'USD-equivalent'];
    const rows = donations.map((d) => {
      const campaignTitle = `"${(d.campaign?.title ?? 'Unknown Campaign').replace(/"/g, '""')}"`;
      const amount = d.amount.toString();
      const asset = d.currency;
      const date = d.createdAt.toISOString();
      const txHash = d.transactionHash ?? '';

      // Use historical price at time of donation (usdAmount or usdRateAtDonation * amount)
      let usdEquivalent = '0';
      if (d.usdAmount) {
        usdEquivalent = d.usdAmount.toString();
      } else if (d.usdRateAtDonation) {
        usdEquivalent = (Number(d.amount) * Number(d.usdRateAtDonation)).toFixed(2);
      } else {
        usdEquivalent = Number(d.amount).toFixed(2); // fallback if rate not stored
      }

      return [campaignTitle, amount, asset, date, txHash, usdEquivalent].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    return { csv, queued: false };
  }
}
