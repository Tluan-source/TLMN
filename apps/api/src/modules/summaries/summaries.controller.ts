import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../../shared/auth.guard';
import { SummaryDateDto } from './summaries.dto';
import { SummariesService } from './summaries.service';

@UseGuards(AuthGuard)
@Controller('couples/me/days/:date/summary')
export class SummariesController {
  constructor(private readonly summaries: SummariesService) {}

  @Get()
  get(@Req() req: Request, @Param() params: SummaryDateDto) {
    return this.summaries.get(req.user!.id, params.date);
  }

  @Post()
  create(@Req() req: Request, @Param() params: SummaryDateDto) {
    return this.summaries.create(req.user!.id, params.date);
  }
}
