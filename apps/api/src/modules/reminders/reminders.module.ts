import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CouplesModule } from '../couples/couples.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({ imports: [AuthModule, CouplesModule, RealtimeModule], controllers: [RemindersController], providers: [RemindersService] })
export class RemindersModule {}
