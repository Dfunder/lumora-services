import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AdminController } from './admin.controller';
import { AuthService } from './auth.service';
import { AdminService } from './admin.service';
import { User } from './entities/user.entity';
import { AuditLog } from './entities/audit-log.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SuspensionGuard } from './guards/suspension.guard';
import { RolesGuard } from './guards/roles.guard';
import { QueueModule } from '../queues/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, AuditLog]),
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
    QueueModule,
  ],
  controllers: [AuthController, AdminController],
  providers: [
    AuthService,
    AdminService,
    JwtAuthGuard,
    SuspensionGuard,
    RolesGuard,
  ],
  exports: [AuthService, AdminService],
})
export class AuthModule {}
