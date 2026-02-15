import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix(config.get('API_PREFIX', 'api'));
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

  const port = config.get('API_PORT', 3001);
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
}
bootstrap();
