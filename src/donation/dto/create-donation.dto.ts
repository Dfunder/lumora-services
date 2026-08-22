import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsBoolean,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  IsStellarAddress,
  IsValidTxHash,
  IsValidAssetCode,
  SanitizeString,
  IsSafeString,
  IsDecimalPrecision,
} from '../../common/validators/common.validators';

export class CreateDonationDto {
  @ApiProperty({
    description: 'Stellar wallet public key of donor',
    example: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  })
  @IsString()
  @IsNotEmpty()
  @IsSafeString()
  @IsStellarAddress()
  @MinLength(56)
  @MaxLength(56)
  walletAddress: string;

  @ApiProperty({ description: 'Campaign ID receiving the donation' })
  @IsString()
  @IsNotEmpty()
  @IsSafeString()
  @MinLength(1)
  @MaxLength(100)
  campaignId: string;

  @ApiProperty({ description: 'On-chain transaction hash for donation verification' })
  @IsString()
  @IsNotEmpty()
  @IsValidTxHash()
  txHash: string;

  @ApiPropertyOptional({ description: 'Claimed amount from request body (will be verified on-chain)' })
  @IsOptional()
  @IsNumber()
  @Min(0.0000001)
  amount?: number;

  @ApiPropertyOptional({ description: 'Claimed asset code from request body (will be verified on-chain)' })
  @IsOptional()
  @IsString()
  @IsValidAssetCode()
  @MaxLength(12)
  assetCode?: string;

  @ApiPropertyOptional({ description: 'Claimed asset issuer from request body (will be verified on-chain)' })
  @IsOptional()
  @IsString()
  @IsSafeString()
  @MaxLength(56)
  assetIssuer?: string;

  @ApiPropertyOptional({ description: 'Whether the donor wants to remain anonymous' })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  @ApiPropertyOptional({ description: 'Optional tip amount attached to the donation' })
  @IsOptional()
  @IsNumber()
  @Min(0.0000001)
  @IsDecimalPrecision(7)
  tipAmount?: number;

  @ApiPropertyOptional({ description: 'Optional asset code for the tip, e.g. XLM or USDC' })
  @IsOptional()
  @IsString()
  @IsValidAssetCode()
  @MaxLength(12)
  tipAsset?: string;

  @ApiPropertyOptional({ description: 'Optional note included with the donation' })
  @IsOptional()
  @IsString()
  @IsSafeString()
  @SanitizeString()
  @MinLength(1)
  @MaxLength(500)
  message?: string;
}