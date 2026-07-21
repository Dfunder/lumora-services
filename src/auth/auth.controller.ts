import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
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

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: VerifyAuthDto) {
    return this.authService.verify(dto);
  }
}