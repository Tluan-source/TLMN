import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../../shared/auth.guard';
import { CreateAnniversaryDto } from './anniversaries.dto';
import { AnniversariesService } from './anniversaries.service';

@UseGuards(AuthGuard)
@Controller('anniversaries')
export class AnniversariesController {
  constructor(private readonly anniversaries: AnniversariesService) {}

  @Get()
  list(@Req() req: Request, @Query('year') year?: string) {
    return this.anniversaries.list(req.user!.id, year);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateAnniversaryDto) {
    return this.anniversaries.create(req.user!.id, dto);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.anniversaries.remove(req.user!.id, id);
  }

  @Post('suggestions')
  suggestions(@Req() req: Request) {
    return this.anniversaries.suggestions(req.user!.id);
  }
}
