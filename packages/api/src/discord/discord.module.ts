import { Module } from '@nestjs/common';
import { DiscordController } from './discord.controller';
import { DiscordService } from './discord.service';

@Module({
  controllers: [DiscordController],
  providers: [DiscordService],
  exports: [DiscordService],
})
export class DiscordModule {}
