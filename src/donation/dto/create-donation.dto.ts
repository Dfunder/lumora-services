import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
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

  @ApiPropertyOptional({ description: 'Campaign ID receiving the donation' })
  @IsOptional()
  @IsString()
  campaignId?: string;

  @ApiPropertyOptional({ description: 'Optional tip amount attached to the donation' })
  @IsOptional()
  @IsNumber()
  @Min(0.0000001)
  tipAmount?: number;

  @ApiPropertyOptional({ description: 'Optional asset code for the tip, e.g. XLM or USDC' })
  @IsOptional()
  @IsString()
  tipAsset?: string;

  @ApiPropertyOptional({ description: 'Optional on-chain transaction hash for donation verification' })
  @IsOptional()
  @IsString()
  transactionHash?: string;

  @ApiPropertyOptional({ description: 'Optional note included with the donation' })
  @IsOptional()
  @IsString()
  message?: string;
}