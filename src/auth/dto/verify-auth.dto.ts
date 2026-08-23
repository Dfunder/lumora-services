import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStellarAddress, SanitizeString, IsSafeString, IsValidTxHash } from '../../common/validators/common.validators';

export class VerifyAuthDto {
  @ApiProperty({ description: 'Stellar wallet public key', example: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' })
  @IsString()
  @IsNotEmpty()
  @IsSafeString()
  @IsStellarAddress()
  @MinLength(56)
  @MaxLength(56)
  walletAddress: string;

  @ApiProperty({ description: 'Base64 encoded signed challenge string' })
  @IsString()
  @IsNotEmpty()
  @IsSafeString()
  @SanitizeString()
  @MinLength(1)
  @MaxLength(10000)
  signedChallenge: string;
}