import { Body, Controller, Delete, Get, Param, Post, Query, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { AuthGuard } from '../../shared/auth.guard';
import { CreateCommentDto, CreateStoryDto, StoryCalendarDto, StoryRecapDto, ToggleReactionDto, UpdateCommentDto } from './stories.dto';
import { StoriesService } from './stories.service';

@UseGuards(AuthGuard)
@Controller()
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Get('stories/calendar')
  calendar(@Req() req: Request, @Query() query: StoryCalendarDto) {
    return this.stories.listCalendar(req.user!.id, query.year);
  }

  @Get('stories/recap')
  recap(@Req() req: Request, @Query() query: StoryRecapDto) {
    return this.stories.monthRecap(req.user!.id, query.month);
  }

  @Get('stories')
  list(@Req() req: Request, @Query('date') date: string) {
    return this.stories.listForDay(req.user!.id, date);
  }

  @Post('stories')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 25 * 1024 * 1024, files: 10 } }))
  create(@Req() req: Request, @Body() dto: CreateStoryDto, @UploadedFiles() files: Express.Multer.File[] = []) {
    return this.stories.create(req.user!.id, dto.date, dto.content, files || [], dto.status);
  }

  @Post('stories/:id/publish')
  publish(@Req() req: Request, @Param('id') id: string) {
    return this.stories.publish(req.user!.id, id);
  }

  @Post('stories/:id/entries')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 25 * 1024 * 1024, files: 10 } }))
  addEntry(@Req() req: Request, @Param('id') id: string, @Body() dto: Pick<CreateStoryDto, 'content'>, @UploadedFiles() files: Express.Multer.File[] = []) {
    return this.stories.addEntry(req.user!.id, id, dto.content, files || []);
  }

  @Delete('stories/:id')
  deleteStory(@Req() req: Request, @Param('id') id: string) {
    return this.stories.deleteStory(req.user!.id, id);
  }

  @Post('stories/:id/comments')
  comment(@Req() req: Request, @Param('id') id: string, @Body() dto: CreateCommentDto) {
    return this.stories.addComment(req.user!.id, id, dto.content, dto.parentId);
  }

  @Post('stories/:storyId/entries/:entryId/reactions')
  react(@Req() req: Request, @Param('storyId') storyId: string, @Param('entryId') entryId: string, @Body() dto: ToggleReactionDto) {
    return this.stories.toggleReaction(req.user!.id, storyId, entryId, dto.emoji);
  }

  @Post('comments/:id/edit')
  editComment(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateCommentDto) {
    return this.stories.updateComment(req.user!.id, id, dto.content);
  }

  @Delete('comments/:id')
  deleteComment(@Req() req: Request, @Param('id') id: string) {
    return this.stories.deleteComment(req.user!.id, id);
  }
}
