import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { VerifyAuthDto } from './dto/verify-auth.dto';
import { RefreshAuthDto } from './dto/refresh-auth.dto';
import { LogoutAuthDto } from './dto/logout-auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: VerifyAuthDto) {
    return this.authService.verify(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshAuthDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body() dto: LogoutAuthDto) {
    return this.authService.logout(dto);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logoutAll(@CurrentUser() user: { sub: string }) {
    return this.authService.logoutAll(user.sub);
  }
}
