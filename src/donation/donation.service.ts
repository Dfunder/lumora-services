import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDonationDto } from './dto/create-donation.dto';

@Injectable()
export class DonationService {
  constructor(private readonly prisma: PrismaService) {}

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
}
