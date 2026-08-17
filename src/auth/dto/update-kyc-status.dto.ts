import { IsEnum, IsNotEmpty } from 'class-validator';
import { KYCStatus } from '../entities/user.entity';

export class UpdateKYCStatusDto {
  @IsEnum(KYCStatus)
  @IsNotEmpty()
  kycStatus: KYCStatus;
}
