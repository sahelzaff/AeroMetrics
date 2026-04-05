import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { ObservabilityService } from './observability/observability.service';
import { GlobalExceptionLoggingFilter } from './common/filters/global-exception-logging.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const observabilityService = app.get(ObservabilityService);

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalInterceptors(new RequestLoggingInterceptor(observabilityService));
  app.useGlobalFilters(new GlobalExceptionLoggingFilter(observabilityService));

  const config = new DocumentBuilder()
    .setTitle('Weekly MCQ Test API')
    .setDescription('Backend APIs for test platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
}

bootstrap();
