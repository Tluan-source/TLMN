import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CredentialsDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;
}

export class RegisterDto extends CredentialsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  displayName!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  newPassword!: string;
}
