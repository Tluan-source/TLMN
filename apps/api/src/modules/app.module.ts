import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CouplesModule } from './couples/couples.module';
import { MediaModule } from './media/media.module';
import { StoriesModule } from './stories/stories.module';
import { SummariesModule } from './summaries/summaries.module';
import { StreaksModule } from './streaks/streaks.module';
import { RemindersModule } from './reminders/reminders.module';
import { UsersModule } from './users/users.module';
import { AnniversariesModule } from './anniversaries/anniversaries.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [PrismaModule, AuthModule, CouplesModule, UsersModule, StoriesModule, MediaModule, SummariesModule, StreaksModule, RemindersModule, AnniversariesModule],
  controllers: [HealthController],
})
export class AppModule {}
