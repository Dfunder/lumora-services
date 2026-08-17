import {
  Controller,
  Post,
  Param,
  UseGuards,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { CampaignsService } from './campaign.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';
import { SuspendCampaignDto } from './dto/update-campaign-status.dto';

@ApiTags('admin-campaigns')
@ApiBearerAuth('JWT-auth')
@Controller('admin/campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @ApiOperation({ summary: 'Suspend a campaign' })
  @ApiParam({ name: 'id', description: 'Campaign ID to suspend' })
  @ApiResponse({ status: 200, description: 'Campaign suspended successfully' })
  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  async suspendCampaign(
    @Param('id') id: string,
    @Body() dto: SuspendCampaignDto,
  ) {
    return await this.campaignsService.suspendCampaign(id, dto.reason);
  }

  @ApiOperation({ summary: 'Feature a campaign' })
  @ApiParam({ name: 'id', description: 'Campaign ID to feature' })
  @ApiResponse({ status: 200, description: 'Campaign featured successfully' })
  @Post(':id/feature')
  @HttpCode(HttpStatus.OK)
  async featureCampaign(@Param('id') id: string) {
    return await this.campaignsService.featureCampaign(id);
  }
}
