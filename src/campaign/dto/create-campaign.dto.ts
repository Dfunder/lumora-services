import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsDateString,
  IsOptional,
  ValidateNested,
  ArrayNotEmpty,
  MaxLength,
  MinLength,
  ArrayMaxSize,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  IsValidUrl,
  IsDecimalPrecision,
  IsValidAssetCode,
  IsValidContractId,
  IsValidNetwork,
  SanitizeString,
  IsSafeString,
  IsValidCampaignDates,
} from '../../common/validators/common.validators';

export class MilestoneDto {
  @ApiProperty({ description: 'Milestone title', example: 'First Development Phase' })
  @IsString()
  @IsNotEmpty()
  @IsSafeString()
  @SanitizeString()
  @MinLength(3)
  @MaxLength(100)
  title: string;

  @ApiProperty({ description: 'Detailed milestone description', example: 'Complete MVP development' })
  @IsString()
  @IsNotEmpty()
  @IsSafeString()
  @SanitizeString()
  @MinLength(10)
  @MaxLength(1000)
  description: string;

  @ApiProperty({ description: 'Target amount for this milestone in XLM', example: '5000' })
  @IsString()
  @IsNotEmpty()
  @IsDecimalPrecision(7)
  targetAmount: string;
}

export class CreateCampaignDto {
  @ApiProperty({ description: 'Campaign title', example: 'Clean Water Initiative' })
  @IsString()
  @IsNotEmpty()
  @IsSafeString()
  @SanitizeString()
  @MinLength(5)
  @MaxLength(100)
  title: string;

  @ApiProperty({ description: 'Brief campaign description', example: 'Providing clean water to rural communities' })
  @IsString()
  @IsNotEmpty()
  @IsSafeString()
  @SanitizeString()
  @MinLength(10)
  @MaxLength(255)
  description: string;

  @ApiProperty({ description: 'Detailed campaign story', example: 'This campaign aims to build wells...' })
  @IsString()
  @IsNotEmpty()
  @IsSafeString()
  @SanitizeString()
  @MinLength(50)
  @MaxLength(10000)
  story: string;

  @ApiProperty({ description: 'URL to campaign cover image', example: 'https://example.com/image.jpg' })
  @IsString()
  @IsNotEmpty()
  @IsValidUrl()
  @MaxLength(2048)
  coverImageUrl: string;

  @ApiProperty({ description: 'Campaign category', example: 'Environment' })
  @IsString()
  @IsNotEmpty()
  @IsSafeString()
  @SanitizeString()
  @MinLength(2)
  @MaxLength(50)
  category: string;

  @ApiProperty({ description: 'Total fundraising goal in XLM', example: '50000' })
  @IsString()
  @IsNotEmpty()
  @IsDecimalPrecision(7)
  goalAmount: string;

  @ApiProperty({ description: 'List of accepted Stellar assets', example: ['XLM', 'USDC'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsValidAssetCode({ each: true })
  acceptedAssets: string[];

  @ApiProperty({ description: 'Campaign start date (ISO string)', example: '2024-01-01T00:00:00Z' })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ description: 'Campaign end date (ISO string)', example: '2024-12-31T23:59:59Z' })
  @IsDateString()
  @IsNotEmpty()
  @IsValidCampaignDates()
  endDate: string;

  @ApiProperty({ description: 'Campaign milestones', type: [MilestoneDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  milestones: MilestoneDto[];

  @ApiProperty({ description: 'Stellar smart contract ID', example: 'CC...' })
  @IsString()
  @IsNotEmpty()
  @IsValidContractId()
  @MinLength(1)
  @MaxLength(64)
  contractId: string;

  @ApiProperty({ description: 'Stellar network', example: 'testnet' })
  @IsString()
  @IsNotEmpty()
  @IsValidNetwork()
  network: string;
}