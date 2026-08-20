import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { CampaignsService } from './campaign.service';
import { Campaign } from './entities/campaign.entity';
import { CampaignDraft } from './entities/campaign-draft.entity';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SorobanService } from '../contract/soroban.service';

describe('Milestone Release Workflow (Issue #39)', () => {
  let service: CampaignsService;
  let prismaService: any;
  let campaignRepo: any;
  let sorobanService: any;

  beforeEach(async () => {
    campaignRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'camp-1', creatorId: 'creator-123', contractId: 'C123' }),
    };

    prismaService = {
      milestone: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    sorobanService = {
      invokeContract: jest.fn().mockResolvedValue({ status: 'SUCCESS', transactionHash: 'tx_release_123' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: getRepositoryToken(Campaign), useValue: campaignRepo },
        { provide: getRepositoryToken(CampaignDraft), useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: prismaService },
        { provide: RedisService, useValue: {} },
        { provide: SorobanService, useValue: sorobanService },
        { provide: getQueueToken('analytics'), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<CampaignsService>(CampaignsService);
  });

  it('should return milestones with status and statusHistory', async () => {
    prismaService.milestone.findMany.mockResolvedValue([
      { id: 'm-1', campaignId: 'camp-1', status: 'UNLOCKED', statusHistory: [] },
    ]);

    const res = await service.getCampaignMilestones('camp-1');
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe('UNLOCKED');
  });

  it('should throw ForbiddenException if request is made by non-creator', async () => {
    await expect(
      service.requestMilestoneRelease('camp-1', 'm-1', 'other-user', 'sig_payload'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should throw BadRequestException if milestone status is LOCKED', async () => {
    prismaService.milestone.findUnique.mockResolvedValue({
      id: 'm-1',
      campaignId: 'camp-1',
      status: 'LOCKED',
    });

    await expect(
      service.requestMilestoneRelease('camp-1', 'm-1', 'creator-123', 'sig_payload'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should record RELEASE_REQUESTED then RELEASED status on successful release', async () => {
    prismaService.milestone.findUnique.mockResolvedValue({
      id: 'm-1',
      campaignId: 'camp-1',
      status: 'UNLOCKED',
    });

    prismaService.milestone.update
      .mockResolvedValueOnce({ id: 'm-1', status: 'RELEASE_REQUESTED' })
      .mockResolvedValueOnce({ id: 'm-1', status: 'RELEASED', txHash: 'tx_release_123' });

    const res = await service.requestMilestoneRelease('camp-1', 'm-1', 'creator-123', 'sig_payload');

    expect(prismaService.milestone.update).toHaveBeenCalledTimes(2);
    expect(sorobanService.invokeContract).toHaveBeenCalledWith('C123', 'release_milestone', ['m-1', 'sig_payload']);
    expect(res.status).toBe('RELEASED');
    expect(res.txHash).toBe('tx_release_123');
  });
});
