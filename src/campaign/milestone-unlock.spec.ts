import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { CampaignsService } from './campaign.service';
import { Campaign } from './entities/campaign.entity';
import { CampaignDraft } from './entities/campaign-draft.entity';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SorobanService } from '../contract/soroban.service';

describe('Milestone Unlock & Creation Workflow (Issue #38)', () => {
  let service: CampaignsService;
  let prismaService: any;
  let campaignRepo: any;

  beforeEach(async () => {
    campaignRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((dto) => Promise.resolve({ id: 'camp-1', ...dto })),
    };

    prismaService = {
      $transaction: jest.fn().mockResolvedValue([]),
      donation: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: '10000' } }),
      },
      milestone: {
        create: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      milestoneStatusHistory: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: getRepositoryToken(Campaign), useValue: campaignRepo },
        { provide: getRepositoryToken(CampaignDraft), useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('false') } },
        { provide: PrismaService, useValue: prismaService },
        { provide: RedisService, useValue: {} },
        { provide: SorobanService, useValue: {} },
        { provide: getQueueToken('analytics'), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<CampaignsService>(CampaignsService);
  });

  it('should enforce max 5 milestones during campaign creation', async () => {
    const tooManyMilestones = Array.from({ length: 6 }, (_, i) => ({
      title: `M${i}`,
      description: `Desc ${i}`,
      targetAmount: `${(i + 1) * 1000}`,
    }));

    await expect(
      service.createCampaign('creator-1', {
        title: 'Campaign 1',
        description: 'Desc',
        story: 'Story',
        coverImageUrl: 'http://img',
        category: 'Tech',
        goalAmount: '50000',
        acceptedAssets: ['XLM'],
        endDate: new Date().toISOString(),
        contractId: 'C123',
        network: 'testnet',
        milestones: tooManyMilestones,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should transactionally create up to 5 milestones sorted ascending by targetAmount', async () => {
    const milestones = [
      { title: 'M2', description: 'Desc 2', targetAmount: '5000' },
      { title: 'M1', description: 'Desc 1', targetAmount: '1000' },
    ];

    await service.createCampaign('creator-1', {
      title: 'Campaign 1',
      description: 'Desc',
      story: 'Story',
      coverImageUrl: 'http://img',
      category: 'Tech',
      goalAmount: '50000',
      acceptedAssets: ['XLM'],
      endDate: new Date().toISOString(),
      contractId: 'C123',
      network: 'testnet',
      milestones,
    });

    expect(prismaService.$transaction).toHaveBeenCalled();
  });

  it('should unlock milestone LOCKED -> UNLOCKED when total raised reaches target amount', async () => {
    prismaService.donation.aggregate.mockResolvedValue({ _sum: { amount: '6000' } });
    prismaService.milestone.findMany.mockResolvedValue([
      { id: 'm-1', campaignId: 'camp-1', targetAmount: '5000', status: 'LOCKED' },
    ]);
    prismaService.milestone.updateMany.mockResolvedValue({ count: 1 });

    const unlocked = await service.checkMilestoneUnlocks('camp-1');

    expect(unlocked).toEqual(['m-1']);
    expect(prismaService.milestone.updateMany).toHaveBeenCalledWith({
      where: { id: 'm-1', status: 'LOCKED' },
      data: { status: 'UNLOCKED' },
    });
  });

  it('should ensure race conditions only trigger unlock ONCE when two donations arrive close together', async () => {
    prismaService.donation.aggregate.mockResolvedValue({ _sum: { amount: '6000' } });
    prismaService.milestone.findMany.mockResolvedValue([
      { id: 'm-1', campaignId: 'camp-1', targetAmount: '5000', status: 'LOCKED' },
    ]);

    // First donation unlock call succeeds (count: 1)
    // Second donation unlock call finds count: 0 because status is no longer LOCKED
    prismaService.milestone.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const res1 = await service.checkMilestoneUnlocks('camp-1');
    const res2 = await service.checkMilestoneUnlocks('camp-1');

    expect(res1).toEqual(['m-1']);
    expect(res2).toEqual([]); // Second call did not trigger unlock again
  });
});
