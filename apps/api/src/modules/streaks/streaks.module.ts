import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CouplesModule } from '../couples/couples.module';
import { StreaksController } from './streaks.controller';
import { StreaksService } from './streaks.service';

@Module({ imports: [AuthModule, CouplesModule], controllers: [StreaksController], providers: [StreaksService] })
export class StreaksModule {}
