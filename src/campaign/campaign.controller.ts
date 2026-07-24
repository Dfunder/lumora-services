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
import { CampaignsService } from './campaign.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Adjust path to match your JWT guard

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  // ─── 1. Publish Campaign ──────────────────────────────────────────────────
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCampaign(@Req() req: any, @Body() dto: CreateCampaignDto) {
    // Extract creatorId directly from JWT user object
    const creatorId = req.user.id;
    return await this.campaignsService.createCampaign(creatorId, dto);
  }

  // ─── 2. Create Draft ──────────────────────────────────────────────────────
  @Post('drafts')
  @HttpCode(HttpStatus.CREATED)
  async createDraft(@Req() req: any, @Body() dto: CreateDraftDto) {
    const creatorId = req.user.id;
    return await this.campaignsService.createDraft(creatorId, dto);
  }

  // ─── 3. Get User Drafts ───────────────────────────────────────────────────
  @Get('drafts')
  async getUserDrafts(@Req() req: any) {
    const creatorId = req.user.id;
    return await this.campaignsService.getUserDrafts(creatorId);
  }

  // ─── 4. Update Draft ──────────────────────────────────────────────────────
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
  @Delete('drafts/:id')
  async deleteDraft(@Req() req: any, @Param('id') id: string) {
    const creatorId = req.user.id;
    return await this.campaignsService.deleteDraft(id, creatorId);
  }
}
