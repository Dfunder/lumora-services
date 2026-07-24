import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CampaignsService } from './campaign.service';
import { Campaign, CampaignStatus } from './entities/campaign.entity';
import { CampaignDraft } from './entities/campaign-draft.entity';

describe('CampaignsService', () => {
  let service: CampaignsService;
  let campaignRepo: any;
  let draftRepo: any;
  let configService: any;

  const mockCampaignRepo = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((dto) => Promise.resolve({ id: 'campaign-1', ...dto })),
  };

  const mockDraftRepo = {
    count: jest.fn(),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((dto) => Promise.resolve({ id: 'draft-1', ...dto })),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn().mockResolvedValue(true),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: getRepositoryToken(Campaign), useValue: mockCampaignRepo },
        { provide: getRepositoryToken(CampaignDraft), useValue: mockDraftRepo },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<CampaignsService>(CampaignsService);
    campaignRepo = module.get(getRepositoryToken(Campaign));
    draftRepo = module.get(getRepositoryToken(CampaignDraft));
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createCampaign', () => {
    it('should set status to ACTIVE when approval workflow is disabled', async () => {
      mockConfigService.get.mockReturnValue('false');

      const result = await service.createCampaign('user-123', {
        title: 'Save the Forests',
        description: 'Desc',
        story: 'Story',
        coverImageUrl: 'http://img.png',
        category: 'Environment',
        goalAmount: '1000',
        acceptedAssets: ['XLM'],
        endDate: '2026-12-31T00:00:00Z',
        milestones: [],
        contractId: 'C123',
        network: 'testnet',
      });

      expect(result.status).toBe(CampaignStatus.ACTIVE);
      expect(result.creatorId).toBe('user-123');
    });

    it('should set status to PENDING_REVIEW when approval workflow is enabled', async () => {
      mockConfigService.get.mockReturnValue('true');

      const result = await service.createCampaign('user-123', {
        title: 'Clean Water',
        description: 'Desc',
        story: 'Story',
        coverImageUrl: 'http://img.png',
        category: 'Health',
        goalAmount: '5000',
        acceptedAssets: ['USDC'],
        endDate: '2026-12-31T00:00:00Z',
        milestones: [],
        contractId: 'C456',
        network: 'testnet',
      });

      expect(result.status).toBe(CampaignStatus.PENDING_REVIEW);
    });
  });

  describe('createDraft', () => {
    it('should create draft if user has fewer than 5 drafts', async () => {
      mockDraftRepo.count.mockResolvedValue(4);

      const result = await service.createDraft('user-123', { title: 'Draft 5' });

      expect(result.title).toBe('Draft 5');
      expect(mockDraftRepo.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException if user already has 5 drafts', async () => {
      mockDraftRepo.count.mockResolvedValue(5);

      await expect(
        service.createDraft('user-123', { title: 'Draft 6' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateDraft', () => {
    it('should throw ForbiddenException if draft belongs to another user', async () => {
      mockDraftRepo.findOne.mockResolvedValue({ id: 'draft-1', creatorId: 'other-user' });

      await expect(
        service.updateDraft('draft-1', 'user-123', { title: 'Hacked' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
