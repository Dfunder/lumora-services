import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DonationController } from './donation.controller';
import { DonationService } from './donation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: 'analytics' }),
  ],
  controllers: [DonationController],
  providers: [DonationService],
  exports: [DonationService],
})
export class DonationModule {}
