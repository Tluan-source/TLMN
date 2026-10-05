import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MESSAGE_REACTIONS } from '@chuyen/contracts';

export class StoryCalendarDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}

export class StoryRecapDto {
  @IsString()
  @Matches(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/)
  month!: string;
}

export class CreateStoryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  content?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED'])
  status?: 'DRAFT' | 'PUBLISHED';
}

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class UpdateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}

export class ToggleReactionDto {
  @IsIn(MESSAGE_REACTIONS)
  emoji!: typeof MESSAGE_REACTIONS[number];
}
