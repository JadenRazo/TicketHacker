import { IsEmail, IsString, IsEnum, MaxLength } from 'class-validator';
import { Role } from '@prisma/client';

export class InviteUserDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsEnum(Role)
  role: Role;
}
