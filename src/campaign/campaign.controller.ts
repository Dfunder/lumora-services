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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody, ApiParam, ApiResponse } from '@nestjs/swagger';
import { CampaignsService } from './campaign.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('campaigns')
@ApiBearerAuth('JWT-auth')
@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  // ─── 1. Publish Campaign ──────────────────────────────────────────────────
  @ApiOperation({ summary: 'Create and publish a new campaign' })
  @ApiBody({ type: CreateCampaignDto })
  @ApiResponse({ status: 201, description: 'Campaign created and published successfully' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCampaign(@Req() req: any, @Body() dto: CreateCampaignDto) {
    // Extract creatorId directly from JWT user object
    const creatorId = req.user.id;
    return await this.campaignsService.createCampaign(creatorId, dto);
  }

  // ─── 2. Create Draft ──────────────────────────────────────────────────────
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
  @ApiOperation({ summary: 'Get all campaign drafts for the authenticated user' })
  @ApiResponse({ status: 200, description: 'List of user drafts returned successfully' })
  @Get('drafts')
  async getUserDrafts(@Req() req: any) {
    const creatorId = req.user.id;
    return await this.campaignsService.getUserDrafts(creatorId);
  }

  // ─── 4. Update Draft ──────────────────────────────────────────────────────
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
  @ApiOperation({ summary: 'Delete a campaign draft' })
  @ApiParam({ name: 'id', description: 'Draft ID to delete' })
  @ApiResponse({ status: 200, description: 'Draft deleted successfully' })
  @Delete('drafts/:id')
  async deleteDraft(@Req() req: any, @Param('id') id: string) {
    const creatorId = req.user.id;
    return await this.campaignsService.deleteDraft(id, creatorId);
  }
}