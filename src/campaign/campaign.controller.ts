import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { CampaignsService } from './campaign.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { MilestoneReleaseRequestDto } from './dto/release-request.dto';
import { Public } from '../auth/decorators/public.decorator';
import { ApiException } from '../common/errors/api-exception';
import { ErrorCode } from '../common/errors/error-codes';

@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Public()
  @Get(':id/milestones')
  @ApiOperation({ summary: 'Get status and history of campaign milestones' })
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiResponse({ status: 200, description: 'Milestones returned' })
  async getCampaignMilestones(@Param('id') id: string) {
    return this.campaignsService.getCampaignMilestones(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Request release of an unlocked milestone (creator-only)' })
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiParam({ name: 'milestoneId', description: 'Milestone ID' })
  @ApiBody({ type: MilestoneReleaseRequestDto })
  @ApiResponse({ status: 200, description: 'Milestone release requested and processed' })
  @ApiResponse({ status: 400, description: 'Milestone not unlocked or invalid request', type: ApiException })
  @ApiResponse({ status: 403, description: 'Forbidden - creator only', type: ApiException })
  @Post(':id/milestones/:milestoneId/release-request')
  async requestMilestoneRelease(
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Req() req: any,
    @Body() dto: MilestoneReleaseRequestDto,
  ) {
    const creatorId = req.user?.id ?? req.user?.userId;
    return this.campaignsService.requestMilestoneRelease(
      id,
      milestoneId,
      creatorId,
      dto.signaturePayload,
    );
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a single campaign by its ID' })
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiResponse({
    status: 200,
    description: 'Campaign details returned successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Campaign not found',
    type: ApiException,
  })
  async getCampaignById(@Param('id') id: string) {
    const campaign = await this.campaignsService.getCampaignById(id);
    if (!campaign) {
      throw new ApiException(
        ErrorCode.CAMPAIGN_001,
        'Campaign not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return campaign;
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update a campaign' })
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiBody({ type: UpdateCampaignDto })
  @ApiResponse({ status: 200, description: 'Campaign updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden', type: ApiException })
  @ApiResponse({
    status: 404,
    description: 'Campaign not found',
    type: ApiException,
  })
  async updateCampaign(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    const creatorId = req.user.id;
    try {
      return await this.campaignsService.updateCampaign(id, creatorId, dto);
    } catch (error) {
      if (error.message.includes('not found')) {
        throw new ApiException(
          ErrorCode.CAMPAIGN_001,
          'Campaign not found',
          HttpStatus.NOT_FOUND,
        );
      }
      throw error;
    }
  }

  @ApiOperation({ summary: 'Create and publish a new campaign' })
  @ApiBody({ type: CreateCampaignDto })
  @ApiResponse({
    status: 201,
    description: 'Campaign created and published successfully',
  })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCampaign(@Req() req: any, @Body() dto: CreateCampaignDto) {
    const creatorId = req.user.id;
    return await this.campaignsService.createCampaign(creatorId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new campaign draft' })
  @ApiBody({ type: CreateDraftDto })
  @ApiResponse({ status: 201, description: 'Draft created successfully' })
  @Post('drafts')
  @HttpCode(HttpStatus.CREATED)
  async createDraft(@Req() req: any, @Body() dto: CreateDraftDto) {
    const creatorId = req.user.id;
    return await this.campaignsService.createDraft(creatorId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get all campaign drafts for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'List of user drafts returned successfully',
  })
  @Get('drafts')
  async getUserDrafts(@Req() req: any) {
    const creatorId = req.user.id;
    return await this.campaignsService.getUserDrafts(creatorId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update an existing campaign draft' })
  @ApiParam({ name: 'id', description: 'Draft ID to update' })
  @ApiBody({ type: UpdateDraftDto })
  @ApiResponse({ status: 200, description: 'Draft updated successfully' })
  @Patch('drafts/:id')
  async updateDraft(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateDraftDto,
  ) {
    const creatorId = req.user.id;
    return await this.campaignsService.updateDraft(id, creatorId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a campaign draft' })
  @ApiParam({ name: 'id', description: 'Draft ID to delete' })
  @ApiResponse({ status: 200, description: 'Draft deleted successfully' })
  @Delete('drafts/:id')
  async deleteDraft(@Req() req: any, @Param('id') id: string) {
    const creatorId = req.user.id;
    return await this.campaignsService.deleteDraft(id, creatorId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get donation analytics for a campaign' })
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiResponse({
    status: 200,
    description: 'Donation analytics returned successfully',
  })
  @Get(':id/donations/analytics')
  async getDonationAnalytics(@Req() req: any, @Param('id') id: string) {
    return await this.campaignsService.getDonationAnalytics(
      id,
      req.user.sub,
      req.user.role,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Close a campaign' })
  @ApiParam({ name: 'id', description: 'Campaign ID to close' })
  @ApiResponse({ status: 200, description: 'Campaign closed successfully' })
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  async closeCampaign(@Req() req: any, @Param('id') id: string) {
    const creatorId = req.user.id;
    return await this.campaignsService.closeCampaign(id, creatorId);
  }

  @ApiOperation({ summary: 'Get all featured campaigns' })
  @ApiResponse({
    status: 200,
    description: 'List of featured campaigns returned successfully',
  })
  @Get('featured')
  async getFeaturedCampaigns() {
    return await this.campaignsService.getFeaturedCampaigns();
  }
}
