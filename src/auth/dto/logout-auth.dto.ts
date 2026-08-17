import { IsString } from 'class-validator';

export class LogoutAuthDto {
  @IsString()
  refreshToken: string;
}
