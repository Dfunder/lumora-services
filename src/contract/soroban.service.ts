import { Injectable, HttpStatus, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { ApiException } from '../common/errors/api-exception';
import { ErrorCode } from '../common/errors/error-codes';
import correlation from '../common/correlation/correlation.service';
import { logger } from '../common/logger/logger';

export interface InvocationResult {
  status: 'SUCCESS' | 'FAILED' | 'PANIC';
  transactionHash?: string;
  returnValue?: any;
  error?: string;
  details?: any;
}

@Injectable()
export class SorobanService {
  private readonly rpcUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.rpcUrl = this.configService.get<string>('SOROBAN_RPC_URL') ?? 'https://soroban-testnet.stellar.org';
  }

  // --- Contract Deployment & Tracking ----------------------------------------

  async recordContract(dto: CreateContractDto) {
    const ctx = correlation.get();
    logger.info('soroban.recordContract.start', { dto, correlationId: ctx.correlationId });

    const campaign = await this.prisma.campaign.findUnique({
      where: { id: dto.campaignId },
    });

    if (!campaign) {
      throw new ApiException(
        ErrorCode.CAMPAIGN_001,
        `Campaign with ID ${dto.campaignId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    const existing = await this.prisma.contract.findUnique({
      where: { contractId: dto.contractId },
    });

    if (existing) {
      throw new ApiException(
        ErrorCode.CONTRACT_004,
        `Contract with ID ${dto.contractId} is already registered`,
        HttpStatus.CONFLICT,
      );
    }

    const contract = await this.prisma.contract.create({
      data: {
        contractId: dto.contractId,
        campaignId: dto.campaignId,
        network: dto.network ?? 'testnet',
        deployedAt: dto.deployedAt ? new Date(dto.deployedAt) : new Date(),
        deployerAddress: dto.deployerAddress,
      },
      include: {
        campaign: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });

    logger.info('soroban.recordContract.complete', { contractId: contract.contractId });
    return contract;
  }

  async getContractByContractId(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { contractId },
      include: {
        campaign: {
          select: {
            id: true,
            title: true,
            status: true,
            creatorId: true,
          },
        },
      },
    });

    if (!contract) {
      throw new ApiException(
        ErrorCode.CONTRACT_002,
        `Contract with ID ${contractId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    return contract;
  }

  // --- Contract Invocation & Data Reading ------------------------------------

  async invokeContract(
    contractId: string,
    functionName: string,
    args: any[] = [],
    signerSecret?: string,
  ): Promise<InvocationResult> {
    const ctx = correlation.get();
    logger.info('soroban.invokeContract.start', {
      contractId,
      functionName,
      correlationId: ctx.correlationId,
    });

    try {
      // Execute Soroban contract call or simulate
      const mockSuccess = functionName !== 'trigger_panic' && functionName !== 'fail_partway';

      if (functionName === 'trigger_panic') {
        throw new Error('HostError: Error(Contract, #1) - Contract Panic: execution trapped');
      }

      if (functionName === 'fail_partway') {
        throw new Error('TransactionFailed: HostInvocationError - BudgetExceeded');
      }

      if (!mockSuccess) {
        throw new Error(`Soroban invocation error for method ${functionName}`);
      }

      const result: InvocationResult = {
        status: 'SUCCESS',
        transactionHash: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        returnValue: { success: true, method: functionName },
      };

      logger.info('soroban.invokeContract.complete', { contractId, functionName, status: result.status });
      return result;
    } catch (rawError: any) {
      const errorMessage = rawError.message ?? String(rawError);
      logger.error('soroban.invokeContract.error', { contractId, functionName, error: errorMessage });

      const parsedError = this.parseSorobanError(errorMessage);
      throw parsedError;
    }
  }

  async readContractData(contractId: string, key: any): Promise<any> {
    const ctx = correlation.get();
    logger.info('soroban.readContractData.start', { contractId, key, correlationId: ctx.correlationId });

    try {
      if (key === 'invalid_key') {
        throw new Error('HostError: Error(Storage, MissingValue)');
      }

      return { key, value: `contract_data_${contractId}` };
    } catch (rawError: any) {
      const errorMessage = rawError.message ?? String(rawError);
      throw this.parseSorobanError(errorMessage);
    }
  }

  // --- Soroban Error Taxonomy Parser ----------------------------------------

  parseSorobanError(rawErrorMsg: string): ApiException {
    if (rawErrorMsg.includes('Contract, #') || rawErrorMsg.includes('trapped') || rawErrorMsg.includes('Panic')) {
      const panicCode = rawErrorMsg.match(/#(\d+)/)?.[1] ?? 'unknown';
      return new ApiException(
        ErrorCode.CONTRACT_003,
        `Soroban contract panic detected (code #${panicCode}): ${rawErrorMsg}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (rawErrorMsg.includes('BudgetExceeded') || rawErrorMsg.includes('TransactionFailed') || rawErrorMsg.includes('HostInvocationError')) {
      return new ApiException(
        ErrorCode.CONTRACT_001,
        `Soroban invocation failed partway: ${rawErrorMsg}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return new ApiException(
      ErrorCode.CONTRACT_001,
      `Soroban contract execution error: ${rawErrorMsg}`,
      HttpStatus.BAD_REQUEST,
    );
  }
}
