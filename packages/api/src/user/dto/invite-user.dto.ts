import { IsEmail, IsString, IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class InviteUserDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsEnum(Role)
  role: Role;
}
