import { Test, TestingModule } from '@nestjs/testing';
import { DonationService } from './donation.service';
import { PrismaService } from '../prisma/prisma.service';
import { getQueueToken } from '@nestjs/bull';

describe('DonationService', () => {
  let service: DonationService;
  let prismaService: any;
  let analyticsQueue: any;

  beforeEach(async () => {
    prismaService = {
      platformTip: {
        create: jest.fn().mockResolvedValue({ id: 'tip-1' }),
      },
      donation: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
    };

    analyticsQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DonationService,
        { provide: PrismaService, useValue: prismaService },
        { provide: getQueueToken('analytics'), useValue: analyticsQueue },
      ],
    }).compile();

    service = module.get<DonationService>(DonationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCampaignDonations', () => {
    it('should return paginated donations and mask anonymous donors', async () => {
      prismaService.donation.count.mockResolvedValue(2);
      prismaService.donation.findMany.mockResolvedValue([
        {
          id: 'don-1',
          campaignId: 'camp-1',
          amount: '100',
          currency: 'XLM',
          status: 'COMPLETED',
          isAnonymous: false,
          createdAt: new Date('2026-08-01'),
          donor: { displayName: 'Alice', walletAddress: 'GALICE' },
        },
        {
          id: 'don-2',
          campaignId: 'camp-1',
          amount: '50',
          currency: 'XLM',
          status: 'COMPLETED',
          isAnonymous: true,
          createdAt: new Date('2026-08-02'),
          donor: { displayName: 'Bob Secret', walletAddress: 'GBOBSECRET' },
        },
      ]);

      const res = await service.getCampaignDonations('camp-1', { page: 1, limit: 20 });

      expect(res.meta.total).toBe(2);
      expect(res.data[0].donor.displayName).toBe('Alice');
      expect(res.data[1].isAnonymous).toBe(true);
      expect(res.data[1].donor.displayName).toBe('Anonymous');
      expect(res.data[1].donor.walletAddress).toBe('Anonymous');
    });
  });

  describe('getUserDonations', () => {
    it('should filter by campaignId and date range', async () => {
      prismaService.donation.count.mockResolvedValue(1);
      prismaService.donation.findMany.mockResolvedValue([
        {
          id: 'don-1',
          donorId: 'user-1',
          campaignId: 'camp-1',
          amount: '100',
          currency: 'XLM',
          createdAt: new Date('2026-08-01'),
          campaign: { title: 'Save Forests' },
        },
      ]);

      const res = await service.getUserDonations('user-1', {
        campaignId: 'camp-1',
        startDate: '2026-08-01',
        endDate: '2026-08-10',
      });

      expect(res.data).toHaveLength(1);
      expect(prismaService.donation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            donorId: 'user-1',
            campaignId: 'camp-1',
          }),
        }),
      );
    });
  });

  describe('exportUserDonationsCsv', () => {
    it('should export CSV with historical price at donation time', async () => {
      prismaService.donation.count.mockResolvedValue(1);
      prismaService.donation.findMany.mockResolvedValue([
        {
          id: 'don-1',
          amount: '100',
          currency: 'XLM',
          transactionHash: 'tx-hash-1',
          usdAmount: '25.00',
          createdAt: new Date('2026-08-01T12:00:00Z'),
          campaign: { title: 'Clean Ocean' },
        },
      ]);

      const res = await service.exportUserDonationsCsv('user-1', {});

      expect(res.queued).toBe(false);
      expect(res.csv).toContain('Campaign,Amount,Asset,Date,TxHash,USD-equivalent');
      expect(res.csv).toContain('"Clean Ocean",100,XLM,2026-08-01T12:00:00.000Z,tx-hash-1,25.00');
    });

    it('should queue export to analytics queue if count > 5000 or queueAsync is true', async () => {
      prismaService.donation.count.mockResolvedValue(6000);

      const res = await service.exportUserDonationsCsv('user-1', {});

      expect(res.queued).toBe(true);
      expect(res.jobId).toBe('job-123');
      expect(analyticsQueue.add).toHaveBeenCalledWith('export-donations-csv', expect.any(Object));
    });
  });
});
