import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { ValidationError } from 'class-validator';
import { AppModule } from './app.module';
import * as Sentry from '@sentry/node';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
      exceptionFactory: (validationErrors: ValidationError[]) => {
        const extractErrors = (
          errors: ValidationError[],
          parentPath = '',
        ): Record<string, string[]> => {
          const result: Record<string, string[]> = {};

          for (const err of errors) {
            const path = parentPath
              ? `${parentPath}.${err.property}`
              : err.property;

            if (err.constraints) {
              result[path] = Object.values(err.constraints);
            }

            if (err.children?.length) {
              Object.assign(result, extractErrors(err.children, path));
            }
          }

          return result;
        };

        return new BadRequestException({
          message: extractErrors(validationErrors),
          error: 'Bad Request',
        });
      },
    }),
  );

  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();