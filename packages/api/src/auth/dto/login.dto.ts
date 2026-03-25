import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}
