import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CouplesModule } from '../couples/couples.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ImageSuggestionService } from './image-suggestion.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({ imports: [AuthModule, CouplesModule, RealtimeModule], controllers: [MediaController], providers: [MediaService, ImageSuggestionService], exports: [MediaService] })
export class MediaModule {}
