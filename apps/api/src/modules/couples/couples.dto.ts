import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateCoupleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}

export class AcceptInvitationDto {
  @IsString()
  @MinLength(20)
  @MaxLength(128)
  token!: string;
}

export class UpdateCoupleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  chatBackground?: string;
}
