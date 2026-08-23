import { IsOptional, IsString, IsInt, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { SanitizeString, IsSafeString } from '../../common/validators/common.validators';

export class AdminSearchQueryDto {
  @IsString()
  @IsOptional()
  @IsSafeString()
  @SanitizeString()
  @MaxLength(100)
  q?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number = 20;
}
