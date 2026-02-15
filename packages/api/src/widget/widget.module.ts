import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WidgetService } from './widget.service';
import { WidgetController } from './widget.controller';
import { OpenclawModule } from '../openclaw/openclaw.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
    OpenclawModule,
  ],
  controllers: [WidgetController],
  providers: [WidgetService],
})
export class WidgetModule {}
