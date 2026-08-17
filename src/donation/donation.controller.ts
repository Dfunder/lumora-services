import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WalletThrottlerGuard } from '../common/guards/wallet-throttler.guard';
import { CreateDonationDto } from './dto/create-donation.dto';

@ApiTags('donation')
@Controller('donation')
export class DonationController {
  @ApiOperation({ summary: 'Process a donation to a campaign' })
  @ApiBody({ type: CreateDonationDto })
  @ApiResponse({ status: 200, description: 'Donation processed successfully' })
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