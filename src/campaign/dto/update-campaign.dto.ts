import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl, MaxLength } from 'class-validator';

export class UpdateCampaignDto {
  @ApiProperty({
    description: 'The new title of the campaign.',
    required: false,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiProperty({
    description: 'The new short description of the campaign.',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    description: 'The new detailed story of the campaign.',
    required: false,
  })
  @IsOptional()
  @IsString()
  story?: string;

  @ApiProperty({
    description: 'The new URL of the cover image for the campaign.',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;
}
