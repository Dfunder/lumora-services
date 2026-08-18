import { PrismaService } from '../prisma/prisma.service';
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
import { RedisService } from '../redis/redis.service';
import { CampaignDraft } from './entities/campaign-draft.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';

import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { logger } from '../common/logger/logger';
import correlation from '../common/correlation/correlation.service';

const MAX_DRAFTS_PER_USER = 5;

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,

    @InjectRepository(CampaignDraft)
    private readonly draftRepository: Repository<CampaignDraft>,

    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    @InjectQueue('analytics') private readonly analyticsQueue: Queue,
  ) {}

  // ─── 1. Get Campaign by ID ────────────────────────────────────────────────
  async getCampaignById(id: string): Promise<Campaign> {
    const ctx = correlation.get();
    logger.info('campaign.getCampaignById.start', { campaignId: id, correlationId: ctx.correlationId });
    const campaign = await this.campaignRepository.findOne({
      where: { id },
      relations: ['creator'],
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID "${id}" not found.`);
    }

    const donations = await this.prisma.donation.findMany({
      where: { campaignId: id },
    });

    const uniqueDonors = new Set(donations.map((d) => d.donorId));
    campaign.donorCount = uniqueDonors.size;

    // Increment view count asynchronously
    await this.analyticsQueue.add('increment-view-count', { campaignId: id, _meta: { correlationId: ctx.correlationId } });

    logger.info('campaign.getCampaignById.complete', { campaignId: id, correlationId: ctx.correlationId });

    return campaign;
  }

  // ─── 2. Update Campaign ───────────────────────────────────────────────────
  async updateCampaign(
    id: string,
    creatorId: string,
    dto: UpdateCampaignDto,
  ): Promise<Campaign> {
    const campaign = await this.campaignRepository.findOne({
      where: { id },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID "${id}" not found.`);
    }

    if (campaign.creatorId !== creatorId) {
      throw new ForbiddenException(
        'You do not have permission to modify this campaign.',
      );
    }

    // Prevent updates to on-chain fields
    if (
      'goalAmount' in dto ||
      'milestones' in dto ||
      'endDate' in dto ||
      'contractId' in dto
    ) {
      throw new BadRequestException(
        'On-chain data (goalAmount, milestones, endDate, contractId) cannot be updated.',
      );
    }

    Object.assign(campaign, dto);
    return await this.campaignRepository.save(campaign);
  }

  // ─── 1. Publish Campaign ──────────────────────────────────────────────────
  async createCampaign(
    creatorId: string,
    dto: CreateCampaignDto,
  ): Promise<Campaign> {
    const ctx = correlation.get();
    logger.info('campaign.create.start', { creatorId, correlationId: ctx.correlationId });
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

    const saved = await this.campaignRepository.save(campaign);
    // Business event
    (await import('../common/events/event.logger')).logEvent('campaign.created', {
      campaignId: saved.id,
      creatorId: saved.creatorId,
    });

    logger.info('campaign.create.complete', { campaignId: saved.id, creatorId: saved.creatorId, correlationId: ctx.correlationId });
    return saved;
  }

  // ─── 2. Create Draft (Max 5 Limit) ────────────────────────────────────────
  async createDraft(
    creatorId: string,
    dto: CreateDraftDto,
  ): Promise<CampaignDraft> {
    const ctx = correlation.get();
    logger.info('campaign.createDraft.start', { creatorId, correlationId: ctx.correlationId });
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
    const draft = await this.draftRepository.findOne({
      where: { id: draftId },
    });

    if (!draft) {
      throw new NotFoundException(`Draft with ID "${draftId}" not found.`);
    }

    if (draft.creatorId !== creatorId) {
      throw new ForbiddenException(
        'You do not have permission to modify this draft.',
      );
    }

    Object.assign(draft, {
      ...dto,
      endDate: dto.endDate ? new Date(dto.endDate) : draft.endDate,
    });

    return await this.draftRepository.save(draft);
  }

  // ─── 5. Delete Draft ──────────────────────────────────────────────────────
  async deleteDraft(
    draftId: string,
    creatorId: string,
  ): Promise<{ success: boolean }> {
    const draft = await this.draftRepository.findOne({
      where: { id: draftId },
    });

    if (!draft) {
      throw new NotFoundException(`Draft with ID "${draftId}" not found.`);
    }

    if (draft.creatorId !== creatorId) {
      throw new ForbiddenException(
        'You do not have permission to delete this draft.',
      );
    }

    await this.draftRepository.remove(draft);
    return { success: true };
  }

  async closeCampaign(
    campaignId: string,
    creatorId: string,
  ): Promise<Campaign> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new NotFoundException(
        `Campaign with ID "${campaignId}" not found.`,
      );
    }

    if (campaign.creatorId !== creatorId) {
      throw new ForbiddenException(
        'You do not have permission to close this campaign.',
      );
    }

    campaign.status = CampaignStatus.CLOSED;

    await this.prisma.auditLog.create({
      data: {
        userId: creatorId,
        action: 'close-campaign',
        details: { campaignId },
      },
    });

    logger.info('campaign.close', { campaignId, creatorId, correlationId: correlation.get().correlationId });

    return await this.campaignRepository.save(campaign);
  }

  async suspendCampaign(campaignId: string, reason: string): Promise<Campaign> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new NotFoundException(
        `Campaign with ID "${campaignId}" not found.`,
      );
    }

    campaign.status = CampaignStatus.SUSPENDED;

    await this.prisma.auditLog.create({
      data: {
        userId: 'admin', // Or the actual admin user ID
        action: 'suspend-campaign',
        details: { campaignId, reason },
      },
    });

    return await this.campaignRepository.save(campaign);
  }

  async featureCampaign(campaignId: string): Promise<Campaign> {
    const featuredCampaignsCount = await this.campaignRepository.count({
      where: { isFeatured: true },
    });

    if (featuredCampaignsCount >= 6) {
      throw new BadRequestException('Cannot feature more than 6 campaigns.');
    }

    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new NotFoundException(
        `Campaign with ID "${campaignId}" not found.`,
      );
    }

    campaign.isFeatured = true;

    await this.prisma.auditLog.create({
      data: {
        userId: 'admin', // Or the actual admin user ID
        action: 'feature-campaign',
        details: { campaignId },
      },
    });

    return await this.campaignRepository.save(campaign);
  }

  async getFeaturedCampaigns(): Promise<Campaign[]> {
    return await this.campaignRepository.find({
      where: { isFeatured: true },
      order: { updatedAt: 'DESC' },
    });
  }

  async getDonationAnalytics(
    campaignId: string,
    currentUserId: string,
    currentUserRole: string,
  ) {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID "${campaignId}" not found.`);
    }

    if (currentUserRole !== 'ADMIN' && campaign.creatorId !== currentUserId) {
      throw new ForbiddenException(
        'You do not have permission to view this campaign donation analytics.',
      );
    }

    const cacheKey = `campaign-analytics:${campaignId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const [donationsPerDay, assetBreakdown, topDonors] = await Promise.all([
      this.prisma.$queryRaw<{ date: string; total: string; count: number }[]>`
        SELECT
          DATE("createdAt")::text AS "date",
          COUNT(*)::int AS "count",
          COALESCE(SUM("amount"), 0)::text AS "total"
        FROM "Donation"
        WHERE "campaignId" = ${campaignId}
          AND "status" = 'COMPLETED'
          AND "createdAt" >= ${startDate}
        GROUP BY DATE("createdAt")
        ORDER BY "date" ASC
      `,
      this.prisma.$queryRaw<{ asset: string; total: string; count: number }[]>`
        SELECT
          "currency" AS "asset",
          COUNT(*)::int AS "count",
          COALESCE(SUM("amount"), 0)::text AS "total"
        FROM "Donation"
        WHERE "campaignId" = ${campaignId}
          AND "status" = 'COMPLETED'
        GROUP BY "currency"
        ORDER BY "total" DESC
      `,
      this.prisma.$queryRaw<{ donorId: string; totalDonated: string; donations: number }[]>`
        SELECT
          "donorId",
          COALESCE(SUM("amount"), 0)::text AS "totalDonated",
          COUNT(*)::int AS "donations"
        FROM "Donation"
        WHERE "campaignId" = ${campaignId}
          AND "status" = 'COMPLETED'
          AND "donorId" IS NOT NULL
        GROUP BY "donorId"
        ORDER BY "totalDonated" DESC
        LIMIT 10
      `,
    ]);

    const response = {
      campaignId,
      rangeDays: 30,
      donationsPerDay,
      assetBreakdown: assetBreakdown,
      topDonors,
    };

    await this.redisService.set(cacheKey, JSON.stringify(response), 300);

    return response;
  }
}
