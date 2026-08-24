import { plainToClass, Transform } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, IsEnum, validateSync } from 'class-validator';

export enum Environment {
  DEVELOPMENT = 'development',
  TEST = 'test',
  PRODUCTION = 'production',
}

export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_REFRESH_SECRET?: string;

  @IsString()
  @IsOptional()
  REDIS_HOST?: string;

  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  REDIS_PORT?: number;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  REDIS_DB?: number;

  @IsString()
  @IsOptional()
  SOROBAN_NETWORK_URL?: string;

  @IsString()
  @IsOptional()
  SOROBAN_NETWORK_PASSPHRASE?: string;

  @IsString()
  @IsOptional()
  ADMIN_ALLOWLIST?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  APPROVAL_WORKFLOW_ENABLED?: boolean;

  @IsString()
  @IsOptional()
  SENTRY_DSN?: string;

  @IsString()
  @IsOptional()
  @IsEnum(Environment)
  APP_ENV?: Environment;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors.map((error) => {
      const constraints = error.constraints;
      return Object.values(constraints || {}).join(', ');
    }).join('; ');

    throw new Error(`Environment validation failed: ${errorMessages}`);
  }

  return validatedConfig;
}