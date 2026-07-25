import {
  Controller,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SuspensionGuard } from './guards/suspension.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { UpdateKYCStatusDto } from './dto/update-kyc-status.dto';
import { SuspendUserDto, UnsuspendUserDto } from './dto/suspend-user.dto';
import { User } from './entities/user.entity';
import type { JwtPayload } from './guards/jwt-auth.guard';

@ApiTags('admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, SuspensionGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @ApiOperation({ summary: 'Update user KYC status (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID to update' })
  @ApiBody({ type: UpdateKYCStatusDto })
  @ApiResponse({ status: 200, description: 'KYC status updated successfully', type: User })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @Patch(':id/kyc')
  @HttpCode(HttpStatus.OK)
  async updateKYCStatus(
    @Param('id') userId: string,
    @Body() dto: UpdateKYCStatusDto,
    @CurrentUser() admin: JwtPayload,
  ): Promise<User> {
    return this.adminService.updateKYCStatus(userId, admin.sub, dto);
  }

  @ApiOperation({ summary: 'Suspend a user (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID to suspend' })
  @ApiBody({ type: SuspendUserDto })
  @ApiResponse({ status: 200, description: 'User suspended successfully', type: User })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @Patch(':id/suspend')
  @HttpCode(HttpStatus.OK)
  async suspendUser(
    @Param('id') userId: string,
    @Body() dto: SuspendUserDto,
    @CurrentUser() admin: JwtPayload,
  ): Promise<User> {
    return this.adminService.suspendUser(userId, admin.sub, dto);
  }

  @ApiOperation({ summary: 'Unsuspend a user (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID to unsuspend' })
  @ApiBody({ type: UnsuspendUserDto, required: false })
  @ApiResponse({ status: 200, description: 'User unsuspended successfully', type: User })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @Patch(':id/unsuspend')
  @HttpCode(HttpStatus.OK)
  async unsuspendUser(
    @Param('id') userId: string,
    @Body() dto: UnsuspendUserDto | undefined,
    @CurrentUser() admin: JwtPayload,
  ): Promise<User> {
    return this.adminService.unsuspendUser(userId, admin.sub, dto);
  }
}