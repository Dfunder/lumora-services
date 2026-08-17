import { Module } from '@nestjs/common';
import { DonationController } from './donation.controller';

@Module({
  controllers: [DonationController],
})
export class DonationModule {}
