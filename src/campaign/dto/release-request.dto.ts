import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class MilestoneReleaseRequestDto {
  @ApiProperty({ description: 'Digital signature payload for on-chain milestone release request' })
  @IsString()
  @IsNotEmpty()
  signaturePayload: string;
}
