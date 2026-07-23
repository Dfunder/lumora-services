import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { ValidationError } from 'class-validator';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
