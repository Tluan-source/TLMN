import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { AuthGuard } from '../../shared/auth.guard';
import { UpdateProfileDto } from './users.dto';
import { UsersService } from './users.service';

@UseGuards(AuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@Req() req: Request) {
    return this.users.getMe(req.user!.id);
  }

  @Patch('me')
  update(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    return this.users.update(req.user!.id, dto);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  avatar(@Req() req: Request, @UploadedFile() file: Express.Multer.File) {
    return this.users.setAvatar(req.user!.id, file);
  }

  @Delete('me/avatar')
  clearAvatar(@Req() req: Request) {
    return this.users.clearAvatar(req.user!.id);
  }

  @Get(':id/profile')
  profile(@Req() req: Request, @Param('id') id: string) {
    return this.users.getWorkspaceProfile(req.user!.id, id);
  }
}
