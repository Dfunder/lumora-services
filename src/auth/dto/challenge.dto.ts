import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStellarAddress } from '../../common/validators/stellar.validators';

export class ChallengeDto {
  @ApiProperty({ description: 'Stellar wallet public key', example: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' })
  @IsString()
  @IsNotEmpty()
  @IsStellarAddress()
  walletAddress: string;
}