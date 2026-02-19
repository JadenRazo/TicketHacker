import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as fs from 'fs';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  // Ensure the uploads directory exists at project root.
  const uploadsDir = join(__dirname, '..', '..', '..', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  app.useLogger(app.get(Logger));
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new AuditLogInterceptor());

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
