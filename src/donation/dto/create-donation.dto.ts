import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsStellarAddress } from 'class-validator';

export class CreateDonationDto {
  @ApiProperty({ description: 'Stellar wallet public key of donor', example: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' })
  @IsString()
  @IsNotEmpty()
  @IsStellarAddress()
  walletAddress: string;
}