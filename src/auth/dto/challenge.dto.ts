import { IsNotEmpty, IsString } from 'class-validator';
import { IsStellarAddress } from '../../common/validators/stellar.validators';

export class ChallengeDto {
  @IsString()
  @IsNotEmpty()
  @IsStellarAddress()
  walletAddress: string;
}
