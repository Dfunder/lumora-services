import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiQuery,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ChallengeDto } from './dto/challenge.dto';
import { VerifyAuthDto } from './dto/verify-auth.dto';
import { RefreshAuthDto } from './dto/refresh-auth.dto';
import { LogoutAuthDto } from './dto/logout-auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SuspensionGuard } from './guards/suspension.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { JwtPayload } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Throttle({
  default: {
    limit: 10,
    ttl: 60000,
  },
})
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Generate authentication challenge for wallet login' })
  @ApiQuery({ name: 'walletAddress', description: 'Stellar wallet public key' })
  @ApiResponse({ status: 200, description: 'Challenge generated successfully' })
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

  @ApiOperation({ summary: 'Verify signed challenge and issue JWT tokens' })
  @ApiBody({ type: VerifyAuthDto })
  @ApiResponse({ status: 200, description: 'Authentication successful, tokens returned' })
  @ApiResponse({ status: 401, description: 'Invalid signature or expired challenge' })
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: VerifyAuthDto) {
    return this.authService.verify(dto);
  }

  @ApiOperation({ summary: 'Refresh access token using refresh token (with rotation)' })
  @ApiBody({ type: RefreshAuthDto })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or revoked refresh token' })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshAuthDto) {
    return this.authService.refresh(dto);
  }

  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiBody({ type: LogoutAuthDto })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: LogoutAuthDto): Promise<void> {
    await this.authService.logout(dto);
  }

  @ApiOperation({ summary: 'Logout from all sessions (requires authentication)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'All sessions revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, SuspensionGuard)
  async logoutAll(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.authService.logoutAll(user.sub);
  }
}
