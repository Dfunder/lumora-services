import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SorobanService } from './soroban.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api-exception';
import { ErrorCode } from '../common/errors/error-codes';

describe('SorobanService', () => {
  let service: SorobanService;
  let prismaService: any;
  let configService: any;

  beforeEach(async () => {
    prismaService = {
      campaign: {
        findUnique: jest.fn(),
      },
      contract: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    configService = {
      get: jest.fn().mockReturnValue('https://soroban-testnet.stellar.org'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SorobanService,
        { provide: PrismaService, useValue: prismaService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<SorobanService>(SorobanService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordContract', () => {
    it('should record a deployed contract linked to a campaign', async () => {
      prismaService.campaign.findUnique.mockResolvedValue({ id: 'camp-1' });
      prismaService.contract.findUnique.mockResolvedValue(null);
      prismaService.contract.create.mockResolvedValue({
        id: 'db-id-1',
        contractId: 'C123',
        campaignId: 'camp-1',
        network: 'testnet',
        deployerAddress: 'GDEPLOYER',
      });

      const res = await service.recordContract({
        contractId: 'C123',
        campaignId: 'camp-1',
        deployerAddress: 'GDEPLOYER',
      });

      expect(res.contractId).toBe('C123');
      expect(prismaService.contract.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contractId: 'C123',
          campaignId: 'camp-1',
          deployerAddress: 'GDEPLOYER',
        }),
        include: expect.any(Object),
      });
    });

    it('should throw 404 ApiException if campaign does not exist', async () => {
      prismaService.campaign.findUnique.mockResolvedValue(null);

      await expect(
        service.recordContract({
          contractId: 'C123',
          campaignId: 'nonexistent',
          deployerAddress: 'GDEPLOYER',
        }),
      ).rejects.toThrow(ApiException);
    });
  });

  describe('invokeContract & Error Parsing', () => {
    it('should parse Soroban contract panic into ErrorCode.CONTRACT_003', async () => {
      const err = await service
        .invokeContract('C123', 'trigger_panic', [])
        .catch((e) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getResponse()).toMatchObject({
        errorCode: ErrorCode.CONTRACT_003,
      });
    });

    it('should parse partial invocation failure partway into ErrorCode.CONTRACT_001', async () => {
      const err = await service
        .invokeContract('C123', 'fail_partway', [])
        .catch((e) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getResponse()).toMatchObject({
        errorCode: ErrorCode.CONTRACT_001,
      });
    });

    it('should return invocation result on successful execution', async () => {
      const res = await service.invokeContract('C123', 'release_funds', []);
      expect(res.status).toBe('SUCCESS');
      expect(res.transactionHash).toBeDefined();
    });
  });
});
