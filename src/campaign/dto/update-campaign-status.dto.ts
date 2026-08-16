import { IsNotEmpty, IsString } from 'class-validator';

export class SuspendCampaignDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
