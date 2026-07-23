import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WalletThrottlerGuard } from '../common/guards/wallet-throttler.guard';
import { CreateDonationDto } from './dto/create-donation.dto';

@Controller('donation')
export class DonationController {
  @UseGuards(WalletThrottlerGuard)
  @Throttle({
    default: {
      limit: 30,
      ttl: 60000,
    },
  })
  @Post()
  @HttpCode(HttpStatus.OK)
  donate(@Body() createDonationDto: CreateDonationDto) {
    // Donation logic goes here
    return { success: true };
  }
}
