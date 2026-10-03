import { Controller, Delete, Get, Param, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { AuthGuard } from '../../shared/auth.guard';
import { ImageSuggestionService } from './image-suggestion.service';
import { MediaService } from './media.service';

@UseGuards(AuthGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService, private readonly suggestions: ImageSuggestionService) {}

  @Post('suggest-caption')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  suggestCaption(@Req() request: Request, @UploadedFile() file: Express.Multer.File) {
    return this.suggestions.suggest(request.user!.id, file);
  }

  @Post('chat-background')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  setChatBackground(@Req() request: Request, @UploadedFile() file: Express.Multer.File) {
    return this.media.setChatBackground(file, request.user!.id);
  }

  @Delete('chat-background')
  clearChatBackground(@Req() request: Request) {
    return this.media.clearChatBackground(request.user!.id);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: Request, @Res() response: Response) {
    const image = await this.media.readForUser(id, request.user!.id);
    response.setHeader('Content-Type', image.mimeType);
    response.setHeader('Cache-Control', 'private, max-age=60');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    response.send(image.data);
  }
}
