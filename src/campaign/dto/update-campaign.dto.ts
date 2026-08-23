import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl, MaxLength, MinLength } from 'class-validator';
import { IsValidUrl, SanitizeString, IsSafeString } from '../../common/validators/common.validators';

export class UpdateCampaignDto {
  @ApiProperty({
    description: 'The new title of the campaign.',
    required: false,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @IsSafeString()
  @SanitizeString()
  @MinLength(5)
  @MaxLength(100)
  title?: string;

  @ApiProperty({
    description: 'The new short description of the campaign.',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @IsSafeString()
  @SanitizeString()
  @MinLength(10)
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    description: 'The new detailed story of the campaign.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsSafeString()
  @SanitizeString()
  @MinLength(50)
  @MaxLength(10000)
  story?: string;

  @ApiProperty({
    description: 'The new URL of the cover image for the campaign.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsValidUrl()
  @MaxLength(2048)
  coverImageUrl?: string;
}
