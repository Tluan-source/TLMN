import 'reflect-metadata';
import { config } from 'dotenv';
import cookieParser = require('cookie-parser');
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { resolve } from 'node:path';
import { AppModule } from './modules/app.module';
import { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const envFile = resolve(__dirname, '../../../.env');
  const envResult = config({ path: envFile });
  for (const name of ['LLM_API_KEY', 'LLM_MODEL', 'LLM_BASE_URL']) {
    const fileValue = envResult.parsed?.[name];
    if (!process.env[name]?.trim() && fileValue?.trim()) process.env[name] = fileValue;
  }
  if (process.env.NODE_ENV !== 'production' && envResult.parsed?.APP_ORIGIN?.trim()) {
    process.env.APP_ORIGIN = envResult.parsed.APP_ORIGIN;
  }
  config();
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  const allowedOrigins = (process.env.APP_ORIGIN || 'http://localhost:3000').split(',').map((item) => item.trim());
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();
    const origin = request.get('origin');
    if (origin && !allowedOrigins.includes(origin)) return response.status(403).json({ message: 'Nguồn gửi yêu cầu không hợp lệ.' });
    return next();
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.enableCors({ origin: allowedOrigins, credentials: true });
  const port = Number(process.env.PORT || 4000);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
