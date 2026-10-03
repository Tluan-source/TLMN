import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CouplesModule } from '../couples/couples.module';
import { StoriesModule } from '../stories/stories.module';
import { SummariesController } from './summaries.controller';
import { SummariesService } from './summaries.service';

@Module({ imports: [AuthModule, CouplesModule, StoriesModule], controllers: [SummariesController], providers: [SummariesService] })
export class SummariesModule {}
