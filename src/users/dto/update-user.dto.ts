import { IsString, IsOptional, IsObject, MaxLength, MinLength, IsUrl } from 'class-validator';
import { IsValidUrl, SanitizeString, IsSafeString } from '../../common/validators/common.validators';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @IsSafeString()
  @SanitizeString()
  @MinLength(2)
  @MaxLength(50)
  displayName?: string;

  @IsString()
  @IsOptional()
  @IsSafeString()
  @SanitizeString()
  @MinLength(10)
  @MaxLength(500)
  bio?: string;

  @IsString()
  @IsOptional()
  @IsValidUrl()
  @MaxLength(2048)
  avatarUrl?: string;

  @IsObject()
  @IsOptional()
  socialLinks?: Record<string, string>;
}
