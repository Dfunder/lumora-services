# Error Response Contract

This document outlines the standardized error response schema for the API. All error responses should conform to this contract to ensure consistency and provide meaningful context for debugging.

## Schema

| Field        | Type     | Description                                                                                                                         |
| ------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `statusCode` | `number` | The HTTP status code.                                                                                                               |
| `message`    | `string` | A human-readable message describing the error.                                                                                      |
| `error`      | `string` | A short, machine-readable string identifying the error type (e.g., `VALIDATION_ERROR`, `AUTH_ERROR`).                               |
| `errorCode`  | `string` | An internal error code for more specific error identification (e.g., `AUTH_001`, `CAMPAIGN_001`).                                   |
| `requestId`  | `string` | The unique ID of the request, used for tracing and debugging.                                                                       |
| `timestamp`  | `string` | The ISO 8601 timestamp of when the error occurred.                                                                                  |
| `path`       | `string` | The path of the request that resulted in the error.                                                                                 |
| `details`    | `any`    | Optional field for additional error details, such as validation errors. This should not be used in production for security reasons. |

## Example

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "VALIDATION_ERROR",
  "errorCode": "VALIDATION_001",
  "requestId": "f8f2f8f2-f8f2-f8f2-f8f2-f8f2f8f2f8f2",
  "timestamp": "2023-10-27T10:00:00.000Z",
  "path": "/api/v1/campaigns",
  "details": [
    {
      "field": "title",
      "message": "Title should not be empty"
    }
  ]
}
```
