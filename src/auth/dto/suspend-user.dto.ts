import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SuspendUserDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class UnsuspendUserDto {
  @IsString()
  @IsOptional()
  notes?: string;
}
