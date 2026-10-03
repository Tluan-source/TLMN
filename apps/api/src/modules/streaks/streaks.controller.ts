import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../../shared/auth.guard';
import { StreaksService } from './streaks.service';

@UseGuards(AuthGuard)
@Controller('streaks')
export class StreaksController {
  constructor(private readonly streaks: StreaksService) {}

  @Get('me')
  get(@Req() req: Request) {
    return this.streaks.current(req.user!.id);
  }
}
