# API Error Response Contract

This document defines the canonical error response format for all Lumora Services HTTP endpoints. Every error returned by the API follows this contract — frontend developers can rely on this shape when building error-handling logic.

## Response Shape

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | `number` | HTTP status code (400, 404, 500, etc.) |
| `message` | `string \| Record<string, string[]>` | Human-readable error message, or field-level validation errors |
| `error` | `string` | Error type string (e.g., `"Bad Request"`, `"Not Found"`, `"Internal Server Error"`) |
| `timestamp` | `string` | ISO 8601 timestamp of when the error was generated |

**Invariant:** Stack traces are **never** exposed in the response body. Internal errors (500) are logged to Sentry with full stack context.

---

## Examples

### 400 — Validation Error (field-level)

When `ValidationPipe` rejects a request body, errors are returned as an object keyed by field path. Nested DTOs use dot notation.

```json
{
  "statusCode": 400,
  "message": {
    "address": ["address must be a valid Stellar public address starting with 'G' and containing a valid checksum."],
    "amount": ["amount must be a positive number"],
    "config.name": ["name must be a string"]
  },
  "error": "Bad Request",
  "timestamp": "2026-07-19T14:30:00.000Z"
}
```

### 400 — Validation Error (single field)

```json
{
  "statusCode": 400,
  "message": {
    "assetCode": ["assetCode must be 'XLM' or a valid alphanumeric Stellar asset code (1-4 or 5-12 characters)."]
  },
  "error": "Bad Request",
  "timestamp": "2026-07-19T14:30:00.000Z"
}
```

### 404 — Not Found

```json
{
  "statusCode": 404,
  "message": "Campaign not found",
  "error": "Not Found",
  "timestamp": "2026-07-19T14:30:00.000Z"
}
```

### 500 — Internal Server Error

```json
{
  "statusCode": 500,
  "message": "Internal server error",
  "error": "Internal Server Error",
  "timestamp": "2026-07-19T14:30:00.000Z"
}
```

**Note:** The original stack trace is captured in Sentry and never returned to the client.

---

## Known HTTP Exceptions

NestJS provides these built-in exceptions. All are caught by `GlobalHttpExceptionFilter` and returned in the canonical shape:

| Exception Class | Status Code | Default `error` field |
|----------------|-------------|----------------------|
| `BadRequestException` | 400 | `"Bad Request"` |
| `UnauthorizedException` | 401 | `"Unauthorized"` |
| `ForbiddenException` | 403 | `"Forbidden"` |
| `NotFoundException` | 404 | `"Not Found"` |
| `ConflictException` | 409 | `"Conflict"` |
| `InternalServerErrorException` | 500 | `"Internal Server Error"` |

Custom exceptions can extend `HttpException` and will be formatted identically.

---

## Custom Validators

| Decorator | Validation Logic |
|-----------|-----------------|
| `@IsStellarAddress()` | Validates a Stellar Ed25519 public key (56 characters, starts with `G`, valid CRC16-XModem checksum). Uses `@stellar/stellar-sdk` internally. |
| `@IsValidAssetCode()` | Validates a Stellar asset code: accepts `XLM` (native) or alphanumeric strings of 1–4 or 5–12 characters (`[a-zA-Z0-9]`). |

Usage in DTOs:

```typescript
import { IsStellarAddress, IsValidAssetCode } from '../common/validators/stellar.validators';

export class CreateDonationDto {
  @IsStellarAddress()
  donorAddress: string;

  @IsStellarAddress()
  campaignAddress: string;

  @IsValidAssetCode()
  assetCode: string;
}
```

---

## Architecture

```
Request
  → Global ValidationPipe (whitelist, transform)
    → DTO decorators (IsStellarAddress, IsValidAssetCode, class-validator built-ins)
      → GlobalHttpExceptionFilter (catches all exceptions)
        → Response { statusCode, message, error, timestamp }
```

- **`ValidationPipe`** is registered globally in `main.ts` via `app.useGlobalPipes()`.
- **`GlobalHttpExceptionFilter`** is registered globally in `main.ts` via `app.useGlobalFilters()`.
- **Custom validators** live in `src/common/validators/stellar.validators.ts`.
- **Exception filter** lives in `src/common/filters/http-exception.filter.ts`.
