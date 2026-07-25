import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStellarAddress } from '../../common/validators/stellar.validators';

export class VerifyAuthDto {
  @ApiProperty({ description: 'Stellar wallet public key', example: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' })
  @IsString()
  @IsNotEmpty()
  @IsStellarAddress()
  walletAddress: string;

  @ApiProperty({ description: 'Base64 encoded signed challenge string' })
  @IsString()
  @IsNotEmpty()
  signedChallenge: string;
}