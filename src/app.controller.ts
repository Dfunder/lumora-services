import { Controller, Get, ApiTags, ApiOperation, ApiResponse } from '@nestjs/common';
import { AppService } from './app.service';

@ApiTags('root')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({ summary: 'Root endpoint - service welcome message' })
  @ApiResponse({ status: 200, description: 'Welcome message returned' })
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}