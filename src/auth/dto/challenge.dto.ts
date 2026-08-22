import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStellarAddress, SanitizeString, IsSafeString } from '../../common/validators/common.validators';

export class ChallengeDto {
  @ApiProperty({ description: 'Stellar wallet public key', example: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' })
  @IsString()
  @IsNotEmpty()
  @IsSafeString()
  @IsStellarAddress()
  @MinLength(56)
  @MaxLength(56)
  walletAddress: string;
}