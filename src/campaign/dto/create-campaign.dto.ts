import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsDateString,
  IsOptional,
  ValidateNested,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MilestoneDto {
  @ApiProperty({ description: 'Milestone title', example: 'First Development Phase' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Detailed milestone description', example: 'Complete MVP development' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Target amount for this milestone in XLM', example: '5000' })
  @IsString()
  @IsNotEmpty()
  targetAmount: string;
}

export class CreateCampaignDto {
  @ApiProperty({ description: 'Campaign title', example: 'Clean Water Initiative' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Brief campaign description', example: 'Providing clean water to rural communities' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Detailed campaign story', example: 'This campaign aims to build wells...' })
  @IsString()
  @IsNotEmpty()
  story: string;

  @ApiProperty({ description: 'URL to campaign cover image', example: 'https://example.com/image.jpg' })
  @IsString()
  @IsNotEmpty()
  coverImageUrl: string;

  @ApiProperty({ description: 'Campaign category', example: 'Environment' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ description: 'Total fundraising goal in XLM', example: '50000' })
  @IsString()
  @IsNotEmpty()
  goalAmount: string;

  @ApiProperty({ description: 'List of accepted Stellar assets', example: ['XLM', 'USDC'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  acceptedAssets: string[];

  @ApiProperty({ description: 'Campaign end date (ISO string)', example: '2024-12-31T23:59:59Z' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ description: 'Campaign milestones', type: [MilestoneDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  milestones: MilestoneDto[];

  @ApiProperty({ description: 'Stellar smart contract ID', example: 'CC...' })
  @IsString()
  @IsNotEmpty()
  contractId: string;

  @ApiProperty({ description: 'Stellar network', example: 'testnet' })
  @IsString()
  @IsNotEmpty()
  network: string;
}