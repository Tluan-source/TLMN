import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CouplesModule } from '../couples/couples.module';
import { MediaModule } from '../media/media.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';

@Module({ imports: [AuthModule, CouplesModule, MediaModule, RealtimeModule], controllers: [StoriesController], providers: [StoriesService], exports: [StoriesService] })
export class StoriesModule {}
