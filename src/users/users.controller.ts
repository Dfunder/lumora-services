import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { PublicProfileDto } from './dto/public-profile.dto';
import { AdminSearchResponseDto } from './dto/admin-search-result.dto';
import { AdminSearchQueryDto } from './dto/admin-search-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @ApiOperation({ summary: 'Get public profile by wallet address' })
  @ApiParam({ name: 'walletAddress', description: 'Stellar wallet public key' })
  @ApiResponse({ status: 200, description: 'Public profile returned', type: PublicProfileDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  @Get('users/:walletAddress')
  getPublicProfile(
    @Param('walletAddress') walletAddress: string,
  ): Promise<PublicProfileDto> {
    return this.usersService.getPublicProfile(walletAddress);
  }

  @ApiOperation({ summary: 'Search users (admin only)' })
  @ApiQuery({ name: 'query', type: AdminSearchQueryDto, description: 'Search parameters' })
  @ApiResponse({ status: 200, description: 'Search results returned', type: AdminSearchResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/users')
  searchUsers(
    @Query() query: AdminSearchQueryDto,
  ): Promise<AdminSearchResponseDto> {
    return this.usersService.searchUsers(query);
  }
}