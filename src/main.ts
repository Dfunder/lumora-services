import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { ValidationError } from 'class-validator';
import { AppModule } from './app.module';
import * as Sentry from '@sentry/node';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './common/logger/winston.config';
import correlationMiddleware from './common/correlation/correlation.middleware';
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
  });

  // Correlation ID + request/response logging middleware
  app.use(correlationMiddleware);

  // Initialize Sentry
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
    });
  }

  // Set up Swagger
  const config = new DocumentBuilder()
    .setTitle('Lumora API')
    .setDescription('Lumora services API documentation')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      security: [{ 'JWT-auth': [] }],
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (validationErrors: ValidationError[] = []) => {
        return new ApiException(
          ErrorCode.VALIDATION_001,
          'Validation failed',
          HttpStatus.BAD_REQUEST,
          validationErrors.map((error) => ({
            field: error.property,
            message: Object.values(error.constraints).join(', '),
          })),
        );
      },
    }),
  );

  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
