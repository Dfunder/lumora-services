import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { AuthGuard } from '../auth.guard';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get(':id/stats')
  @UseGuards(AuthGuard)
  async getCampaignStatistics(@Param('id') id: string, @Req() req) {
    // In a real app, you'd check if req.user.id is the campaign creator or an admin
    return this.campaignsService.getCampaignStatistics(+id);
  }
}
