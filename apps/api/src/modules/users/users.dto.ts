import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CHAT_ICONS } from '@chuyen/contracts';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bio?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  chatNickname?: string | null;

  @IsOptional()
  @IsIn(CHAT_ICONS)
  chatIcon?: typeof CHAT_ICONS[number];

  @IsOptional()
  @IsIn(['UNSPECIFIED', 'MALE', 'FEMALE', 'OTHER'])
  gender?: 'UNSPECIFIED' | 'MALE' | 'FEMALE' | 'OTHER';
}
