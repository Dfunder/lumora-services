import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { PublicProfileDto } from './dto/public-profile.dto';
import { AdminSearchResponseDto } from './dto/admin-search-result.dto';
import { AdminSearchQueryDto } from './dto/admin-search-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users/:walletAddress')
  getPublicProfile(
    @Param('walletAddress') walletAddress: string,
  ): Promise<PublicProfileDto> {
    return this.usersService.getPublicProfile(walletAddress);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/users')
  searchUsers(
    @Query() query: AdminSearchQueryDto,
  ): Promise<AdminSearchResponseDto> {
    return this.usersService.searchUsers(query);
  }
}
