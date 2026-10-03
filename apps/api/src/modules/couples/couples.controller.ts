import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../../shared/auth.guard';
import { AcceptInvitationDto, CreateCoupleDto, UpdateCoupleDto } from './couples.dto';
import { CouplesService } from './couples.service';

@UseGuards(AuthGuard)
@Controller('couples')
export class CouplesController {
  constructor(private readonly couples: CouplesService) {}

  @Get('me')
  current(@Req() req: Request) {
    return this.couples.current(req.user!.id);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateCoupleDto) {
    return this.couples.create(req.user!.id, dto.name);
  }

  @Patch('me')
  update(@Req() req: Request, @Body() dto: UpdateCoupleDto) {
    return this.couples.updateSettings(req.user!.id, dto);
  }

  @Post('me/invitations')
  createInvitation(@Req() req: Request) {
    return this.couples.createInvitation(req.user!.id);
  }

  @Post('invitations/accept')
  accept(@Req() req: Request, @Body() dto: AcceptInvitationDto) {
    return this.couples.acceptInvitation(req.user!.id, dto.token);
  }
}
