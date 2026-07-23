import { IsString, IsNotEmpty } from 'class-validator';

export class CreateDonationDto {
  @IsString()
  @IsNotEmpty()
  walletAddress: string;
}
