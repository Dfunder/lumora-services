import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SorobanService } from './soroban.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiException } from '../common/errors/api-exception';

@ApiTags('contracts')
@Controller('contracts')
export class ContractController {
  constructor(private readonly sorobanService: SorobanService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Register a deployed Soroban contract' })
  @ApiBody({ type: CreateContractDto })
  @ApiResponse({ status: 201, description: 'Contract registered successfully' })
  @ApiResponse({ status: 400, description: 'Validation or Registration error', type: ApiException })
  @Post()
  async createContract(@Body() dto: CreateContractDto) {
    return this.sorobanService.recordContract(dto);
  }

  @ApiOperation({ summary: 'Get details of a registered contract by contractId' })
  @ApiParam({ name: 'contractId', description: 'Soroban contract ID (C...)' })
  @ApiResponse({ status: 200, description: 'Contract details returned' })
  @ApiResponse({ status: 404, description: 'Contract not found', type: ApiException })
  @Get(':contractId')
  async getContract(@Param('contractId') contractId: string) {
    return this.sorobanService.getContractByContractId(contractId);
  }
}
