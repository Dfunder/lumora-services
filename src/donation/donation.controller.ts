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
import { DonationService } from './donation.service';
import { ApiException } from 'src/common/errors/api-exception';
import { ErrorCode } from 'src/common/errors/error-codes';

@ApiTags('donation')
@Controller('donation')
export class DonationController {
  constructor(private readonly donationService: DonationService) {}

  @ApiOperation({ summary: 'Process a donation to a campaign' })
  @ApiBody({ type: CreateDonationDto })
  @ApiResponse({ status: 200, description: 'Donation processed successfully' })
  @ApiResponse({
    status: 400,
    description: 'Donation failed',
    type: ApiException,
  })
  @UseGuards(WalletThrottlerGuard)
  @Throttle({
    default: {
      limit: 30,
      ttl: 60000,
    },
  })
  @Post()
  @HttpCode(HttpStatus.OK)
  async donate(@Body() createDonationDto: CreateDonationDto) {
    try {
      return await this.donationService.submitDonation(createDonationDto);
    } catch (error) {
      throw new ApiException(
        ErrorCode.DONATION_001,
        'Donation failed',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
