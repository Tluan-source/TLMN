import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma.module';
import { ChatGateway } from './chat.gateway';

@Module({ imports: [PrismaModule], providers: [ChatGateway], exports: [ChatGateway] })
export class RealtimeModule {}
