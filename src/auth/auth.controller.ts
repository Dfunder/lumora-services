import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ChallengeDto } from './dto/challenge.dto';
import { VerifyAuthDto } from './dto/verify-auth.dto';
import { ApiException } from '../common/errors/api-exception';
import { ErrorCode } from '../common/errors/error-codes';

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

  @ApiOperation({
    summary: 'Generate authentication challenge for wallet login',
  })
  @ApiQuery({ name: 'walletAddress', description: 'Stellar wallet public key' })
  @ApiResponse({ status: 200, description: 'Challenge generated successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid wallet address',
    type: ApiException,
  })
  @Get('challenge')
  @Throttle({
    default: {
      limit: 5,
      ttl: 60000,
    },
  })
  async challenge(@Query() dto: ChallengeDto) {
    try {
      return await this.authService.challenge(dto.walletAddress);
    } catch (error) {
      throw new ApiException(
        ErrorCode.AUTH_001,
        'Invalid wallet address',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @ApiOperation({ summary: 'Verify signed challenge and issue JWT tokens' })
  @ApiBody({ type: VerifyAuthDto })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful, tokens returned',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid signature or expired challenge',
    type: ApiException,
  })
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: VerifyAuthDto) {
    return this.authService.verify(dto);
  }
}
