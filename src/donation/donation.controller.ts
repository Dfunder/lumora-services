import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { WalletThrottlerGuard } from '../common/guards/wallet-throttler.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CreateDonationDto } from './dto/create-donation.dto';
import { DonationService } from './donation.service';
import { ApiException } from '../common/errors/api-exception';
import { ErrorCode } from '../common/errors/error-codes';

@ApiTags('donation')
@Controller()
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
  @Post('donation')
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

  @Public()
  @ApiOperation({ summary: "Get campaign's donor leaderboard and donation history" })
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  @Get('campaigns/:id/donations')
  async getCampaignDonations(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: 'asc' | 'desc',
  ) {
    return this.donationService.getCampaignDonations(id, {
      page,
      limit,
      sortBy,
      order,
    });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Export user donation history as CSV' })
  @ApiQuery({ name: 'format', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'campaignId', required: false, type: String })
  @Get('users/me/donations/export')
  async exportUserDonations(
    @Req() req: any,
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('campaignId') campaignId?: string,
  ) {
    const userId = req.user?.id ?? req.user?.userId;
    const result = await this.donationService.exportUserDonationsCsv(userId, {
      startDate,
      endDate,
      campaignId,
      userEmail: req.user?.email,
    });

    if (result.queued) {
      return res.status(HttpStatus.ACCEPTED).json({
        message: 'CSV export job queued successfully',
        jobId: result.jobId,
      });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="donation_history.csv"',
    );
    return res.status(HttpStatus.OK).send(result.csv);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get user donation history' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'campaignId', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Get('users/me/donations')
  async getUserDonations(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('campaignId') campaignId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: 'asc' | 'desc',
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user?.id ?? req.user?.userId;
    return this.donationService.getUserDonations(userId, {
      startDate,
      endDate,
      campaignId,
      sortBy,
      order,
      page,
      limit,
    });
  }
}
