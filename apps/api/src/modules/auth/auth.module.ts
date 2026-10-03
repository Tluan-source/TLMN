import { Module } from '@nestjs/common';
import { AuthGuard } from '../../shared/auth.guard';
import { RealtimeModule } from '../realtime/realtime.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({ imports: [RealtimeModule], controllers: [AuthController], providers: [AuthService, AuthGuard], exports: [AuthGuard, AuthService] })
export class AuthModule {}
