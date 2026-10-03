import { Module } from '@nestjs/common';
import { CouplesModule } from '../couples/couples.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AnniversariesController } from './anniversaries.controller';
import { AnniversariesService } from './anniversaries.service';

@Module({ imports: [CouplesModule, RealtimeModule], controllers: [AnniversariesController], providers: [AnniversariesService] })
export class AnniversariesModule {}
