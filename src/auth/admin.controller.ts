import {
  Controller,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
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

@Controller('admin/users')
@UseGuards(JwtAuthGuard, SuspensionGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Patch(':id/kyc')
  @HttpCode(HttpStatus.OK)
  async updateKYCStatus(
    @Param('id') userId: string,
    @Body() dto: UpdateKYCStatusDto,
    @CurrentUser() admin: JwtPayload,
  ): Promise<User> {
    return this.adminService.updateKYCStatus(userId, admin.sub, dto);
  }

  @Patch(':id/suspend')
  @HttpCode(HttpStatus.OK)
  async suspendUser(
    @Param('id') userId: string,
    @Body() dto: SuspendUserDto,
    @CurrentUser() admin: JwtPayload,
  ): Promise<User> {
    return this.adminService.suspendUser(userId, admin.sub, dto);
  }

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
