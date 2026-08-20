import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

export class CreateContractDto {
  @ApiProperty({ description: 'Soroban contract ID (C...)' })
  @IsString()
  @IsNotEmpty()
  contractId: string;

  @ApiProperty({ description: 'Associated Campaign ID' })
  @IsString()
  @IsNotEmpty()
  campaignId: string;

  @ApiProperty({ description: 'Network name', default: 'testnet', required: false })
  @IsString()
  @IsOptional()
  network?: string;

  @ApiProperty({ description: 'Deployment timestamp', required: false })
  @IsOptional()
  @IsDateString()
  deployedAt?: string;

  @ApiProperty({ description: 'Stellar wallet address of deployer' })
  @IsString()
  @IsNotEmpty()
  deployerAddress: string;
}
