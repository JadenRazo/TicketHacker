import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new GlobalExceptionFilter());

  app.setGlobalPrefix(config.get('API_PREFIX', 'api'), {
    exclude: ['health'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableCors({
    origin: [
      config.get('APP_URL', 'http://localhost:5173'),
      config.get('WIDGET_URL', 'http://localhost:5174'),
    ],
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('TicketHacker API')
    .setDescription('Multi-tenant ticketing platform API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = config.get('API_PORT', 3001);
  await app.listen(port);
  app.get(Logger).log(`API running on http://localhost:${port}`);
}
bootstrap();
