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
import { Public } from 'src/auth/decorators/public.decorator';

@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  // ─── 1. Get Campaign by ID ────────────────────────────────────────────────
  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a single campaign by its ID' })
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiResponse({
    status: 200,
    description: 'Campaign details returned successfully',
  })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async getCampaignById(@Param('id') id: string) {
    return await this.campaignsService.getCampaignById(id);
  }

  // ─── 2. Update Campaign ───────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update a campaign' })
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiBody({ type: UpdateCampaignDto })
  @ApiResponse({ status: 200, description: 'Campaign updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async updateCampaign(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    const creatorId = req.user.id;
    return await this.campaignsService.updateCampaign(id, creatorId, dto);
  }
  // ─── 1. Publish Campaign ──────────────────────────────────────────────────
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
    // Extract creatorId directly from JWT user object
    const creatorId = req.user.id;
    return await this.campaignsService.createCampaign(creatorId, dto);
  }

  // ─── 2. Create Draft ──────────────────────────────────────────────────────
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

  // ─── 3. Get User Drafts ───────────────────────────────────────────────────
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

  // ─── 4. Update Draft ──────────────────────────────────────────────────────
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

  // ─── 5. Delete Draft ──────────────────────────────────────────────────────
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
  @ApiResponse({ status: 200, description: 'Donation analytics returned successfully' })
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
