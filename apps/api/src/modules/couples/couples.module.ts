import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CouplesController } from './couples.controller';
import { CouplesService } from './couples.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({ imports: [AuthModule, RealtimeModule], controllers: [CouplesController], providers: [CouplesService], exports: [CouplesService] })
export class CouplesModule {}
