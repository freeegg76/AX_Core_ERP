import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const prefix = config.get<string>('API_PREFIX', 'api/v1');
  const port = Number(config.get<string>('API_PORT', '3000'));

  app.setGlobalPrefix(prefix);
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', 'http://localhost:5173').split(','),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // company_id / entity_id 를 본문·쿼리로 보내면 400 으로 거부한다(FR-Bank-08).
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const doc = new DocumentBuilder()
    .setTitle('AX Bridge API')
    .setDescription(
      'SYSTEM / PARTNER / SALES / FINANCE 내부 업무 시스템. ' +
        '테넌트 격리: company_id·entity_id 는 JWT claim 에서만 얻는다(FR-Bank-08).',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(`${prefix}/docs`, app, SwaggerModule.createDocument(app, doc));

  await app.listen(port);
  new Logger('Bootstrap').log(`AX Bridge API — http://localhost:${port}/${prefix} (docs: /${prefix}/docs)`);
}

void bootstrap();
