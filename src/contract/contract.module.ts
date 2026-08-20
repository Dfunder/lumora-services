import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { SorobanService } from './soroban.service';
import { ContractController } from './contract.controller';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [ContractController],
  providers: [SorobanService],
  exports: [SorobanService],
})
export class ContractModule {}
