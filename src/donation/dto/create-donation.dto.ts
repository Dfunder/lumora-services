import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsBoolean,
} from 'class-validator';
import { IsStellarAddress } from '../../common/validators/stellar.validators';

export class CreateDonationDto {
  @ApiProperty({
    description: 'Stellar wallet public key of donor',
    example: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  })
  @IsString()
  @IsNotEmpty()
  @IsStellarAddress()
  walletAddress: string;

  @ApiProperty({ description: 'Campaign ID receiving the donation' })
  @IsString()
  @IsNotEmpty()
  campaignId: string;

  @ApiProperty({ description: 'On-chain transaction hash for donation verification' })
  @IsString()
  @IsNotEmpty()
  txHash: string;

  @ApiPropertyOptional({ description: 'Claimed amount from request body (will be verified on-chain)' })
  @IsOptional()
  @IsNumber()
  @Min(0.0000001)
  amount?: number;

  @ApiPropertyOptional({ description: 'Claimed asset code from request body (will be verified on-chain)' })
  @IsOptional()
  @IsString()
  assetCode?: string;

  @ApiPropertyOptional({ description: 'Claimed asset issuer from request body (will be verified on-chain)' })
  @IsOptional()
  @IsString()
  assetIssuer?: string;

  @ApiPropertyOptional({ description: 'Whether the donor wants to remain anonymous' })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  @ApiPropertyOptional({ description: 'Optional tip amount attached to the donation' })
  @IsOptional()
  @IsNumber()
  @Min(0.0000001)
  tipAmount?: number;

  @ApiPropertyOptional({ description: 'Optional asset code for the tip, e.g. XLM or USDC' })
  @IsOptional()
  @IsString()
  tipAsset?: string;

  @ApiPropertyOptional({ description: 'Optional note included with the donation' })
  @IsOptional()
  @IsString()
  message?: string;
}