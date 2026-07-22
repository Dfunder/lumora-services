import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ChallengeDto } from './dto/challenge.dto';
import { VerifyAuthDto } from './dto/verify-auth.dto';

@Throttle({
  default: {
    limit: 10,
    ttl: 60000,
  },
})
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('challenge')
  @Throttle({
    default: {
      limit: 5,
      ttl: 60000,
    },
  })
  challenge(@Query() dto: ChallengeDto) {
    return this.authService.challenge(dto.walletAddress);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: VerifyAuthDto) {
    return this.authService.verify(dto);
  }
}
