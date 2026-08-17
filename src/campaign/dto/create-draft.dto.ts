import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MilestoneDto } from './create-campaign.dto';

export class CreateDraftDto {
  @ApiPropertyOptional({ description: 'Campaign title', example: 'Clean Water Initiative' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Brief campaign description', example: 'Providing clean water to rural communities' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Detailed campaign story', example: 'This campaign aims to build wells...' })
  @IsOptional()
  @IsString()
  story?: string;

  @ApiPropertyOptional({ description: 'URL to campaign cover image', example: 'https://example.com/image.jpg' })
  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @ApiPropertyOptional({ description: 'Campaign category', example: 'Environment' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Total fundraising goal in XLM', example: '50000' })
  @IsOptional()
  @IsString()
  goalAmount?: string;

  @ApiPropertyOptional({ description: 'List of accepted Stellar assets', example: ['XLM', 'USDC'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptedAssets?: string[];

  @ApiPropertyOptional({ description: 'Campaign end date (ISO string)', example: '2024-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Campaign milestones', type: [MilestoneDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  milestones?: MilestoneDto[];

  @ApiPropertyOptional({ description: 'Stellar smart contract ID', example: 'CC...' })
  @IsOptional()
  @IsString()
  contractId?: string;

  @ApiPropertyOptional({ description: 'Stellar network', example: 'testnet' })
  @IsOptional()
  @IsString()
  network?: string;
}