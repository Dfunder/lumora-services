import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Campaign, CampaignStatus } from './entities/campaign.entity';
import { CampaignDraft } from './entities/campaign-draft.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';

const MAX_DRAFTS_PER_USER = 5;

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,

    @InjectRepository(CampaignDraft)
    private readonly draftRepository: Repository<CampaignDraft>,

    private readonly configService: ConfigService,
  ) {}

  // ─── 1. Publish Campaign ──────────────────────────────────────────────────
  async createCampaign(creatorId: string, dto: CreateCampaignDto): Promise<Campaign> {
    // Check feature flag for ISSUE-020 review workflow
    const isApprovalEnabled =
      this.configService.get<string>('APPROVAL_WORKFLOW_ENABLED') === 'true';

    const status = isApprovalEnabled
      ? CampaignStatus.PENDING_REVIEW
      : CampaignStatus.ACTIVE;

    const campaign = this.campaignRepository.create({
      ...dto,
      creatorId, // Injected directly from JWT context
      status,
      endDate: new Date(dto.endDate),
    });

    return await this.campaignRepository.save(campaign);
  }

  // ─── 2. Create Draft (Max 5 Limit) ────────────────────────────────────────
  async createDraft(creatorId: string, dto: CreateDraftDto): Promise<CampaignDraft> {
    const existingDraftsCount = await this.draftRepository.count({
      where: { creatorId },
    });

    if (existingDraftsCount >= MAX_DRAFTS_PER_USER) {
      throw new BadRequestException(
        `Draft limit reached. You cannot have more than ${MAX_DRAFTS_PER_USER} drafts.`,
      );
    }

    const draft = this.draftRepository.create({
      ...dto,
      creatorId, // Injected directly from JWT context
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });

    return await this.draftRepository.save(draft);
  }

  // ─── 3. Get User Drafts ───────────────────────────────────────────────────
  async getUserDrafts(creatorId: string): Promise<CampaignDraft[]> {
    return await this.draftRepository.find({
      where: { creatorId },
      order: { updatedAt: 'DESC' },
    });
  }

  // ─── 4. Update Draft ──────────────────────────────────────────────────────
  async updateDraft(
    draftId: string,
    creatorId: string,
    dto: UpdateDraftDto,
  ): Promise<CampaignDraft> {
    const draft = await this.draftRepository.findOne({ where: { id: draftId } });

    if (!draft) {
      throw new NotFoundException(`Draft with ID "${draftId}" not found.`);
    }

    if (draft.creatorId !== creatorId) {
      throw new ForbiddenException('You do not have permission to modify this draft.');
    }

    Object.assign(draft, {
      ...dto,
      endDate: dto.endDate ? new Date(dto.endDate) : draft.endDate,
    });

    return await this.draftRepository.save(draft);
  }

  // ─── 5. Delete Draft ──────────────────────────────────────────────────────
  async deleteDraft(draftId: string, creatorId: string): Promise<{ success: boolean }> {
    const draft = await this.draftRepository.findOne({ where: { id: draftId } });

    if (!draft) {
      throw new NotFoundException(`Draft with ID "${draftId}" not found.`);
    }

    if (draft.creatorId !== creatorId) {
      throw new ForbiddenException('You do not have permission to delete this draft.');
    }

    await this.draftRepository.remove(draft);
    return { success: true };
  }
}
