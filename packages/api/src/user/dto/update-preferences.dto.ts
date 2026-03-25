import { IsObject } from 'class-validator';

export class UpdatePreferencesDto {
  @IsObject()
  preferences: Record<string, any>;
}
