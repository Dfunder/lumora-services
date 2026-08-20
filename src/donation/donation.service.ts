import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDonationDto } from './dto/create-donation.dto';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Server, Transaction } from '@stellar/stellar-sdk';
import { ConfigService } from '@nestjs/config';
import { ApiException } from '../common/errors/api-exception';
import { ErrorCode } from '../common/errors/error-codes';

@Injectable()
export class DonationService {
  private readonly horizonServer: Server;
  private readonly logger = new Logger(DonationService.name);
  private readonly acceptedAssets: Array<{ code: string; issuer: string }>;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('analytics') private readonly analyticsQueue: Queue,
    private readonly configService: ConfigService,
  ) {
    const horizonUrl = this.configService.get<string>('HORIZON_URL') ?? 'https://horizon-testnet.stellar.org';
    this.horizonServer = new Server(horizonUrl);
    // Configure accepted assets from environment or use defaults (XLM and testnet USDC)
    const acceptedAssetsEnv = this.configService.get<string>('ACCEPTED_ASSETS');
    if (acceptedAssetsEnv) {
      this.acceptedAssets = JSON.parse(acceptedAssetsEnv);
    } else {
      this.acceptedAssets = [
        // Native XLM (no issuer needed)
        { code: 'XLM', issuer: '' },
        // Testnet USDC issuer
        { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4AQQZGX4IHWNOCT3' },
      ];
    }
  }

  // Exponential backoff utility
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Fetch transaction with retries
  private async fetchTransactionWithRetries(txHash: string, maxRetries = 3): Promise<any> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const transaction = await this.horizonServer.transactions().transaction(txHash).call();
        return transaction;
      } catch (error: any) {
        attempt++;
        this.logger.warn(`Transaction fetch attempt ${attempt} failed for txHash ${txHash}: ${error.message}`);
        
        if (attempt >= maxRetries) {
          throw new ApiException(
            ErrorCode.DONATION_002,
            `Failed to verify transaction after ${maxRetries} attempts`,
            400,
          );
        }

        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = Math.pow(2, attempt) * 1000;
        await this.delay(backoffMs);
      }
    }
    throw new Error('Unexpected error in transaction fetch');
  }

  // Verify transaction details
  private verifyTransaction(transaction: any, campaignContractAddress: string): { amount: string; assetCode: string; assetIssuer: string } {
    // Check if transaction is confirmed
    if (transaction.successful !== true) {
      throw new ApiException(
        ErrorCode.DONATION_003,
        'Transaction was not successful on-chain',
        400,
      );
    }

    // Get operations from the transaction
    const operations = transaction.operation_records || [];
    if (operations.length === 0) {
      throw new ApiException(
        ErrorCode.DONATION_004,
        'No operations found in transaction',
        400,
      );
    }

    // Find the payment operation to the campaign contract
    const paymentOp = operations.find(op => 
      op.type === 'payment' && 
      op.to === campaignContractAddress
    );

    if (!paymentOp) {
      throw new ApiException(
        ErrorCode.DONATION_005,
        'No valid payment operation to campaign contract found in transaction',
        400,
      );
    }

    // Verify asset is accepted
    const assetCode = paymentOp.asset_code || 'XLM';
    const assetIssuer = paymentOp.asset_issuer || '';
    const isAccepted = this.acceptedAssets.some(asset => 
      asset.code === assetCode && (asset.code === 'XLM' || asset.issuer === assetIssuer)
    );

    if (!isAccepted) {
      throw new ApiException(
        ErrorCode.DONATION_006,
        `Asset ${assetCode}:${assetIssuer} is not accepted for donations`,
        400,
      );
    }

    return {
      amount: paymentOp.amount,
      assetCode,
      assetIssuer,
    };
  }

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