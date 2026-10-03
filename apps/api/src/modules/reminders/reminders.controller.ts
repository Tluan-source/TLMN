import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../../shared/auth.guard';
import { CreateReminderDto, PlanReminderDto } from './reminders.dto';
import { RemindersService } from './reminders.service';

@UseGuards(AuthGuard)
@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  list(@Req() request: Request) {
    return this.reminders.list(request.user!.id);
  }

  @Post()
  create(@Req() request: Request, @Body() dto: CreateReminderDto) {
    return this.reminders.create(request.user!.id, dto);
  }

  @Post('plan')
  plan(@Req() request: Request, @Body() dto: PlanReminderDto) {
    return this.reminders.plan(request.user!.id, dto);
  }

  @Patch(':id/complete')
  complete(@Req() request: Request, @Param('id') id: string) {
    return this.reminders.complete(request.user!.id, id);
  }

  @Delete(':id')
  remove(@Req() request: Request, @Param('id') id: string) {
    return this.reminders.remove(request.user!.id, id);
  }
}
