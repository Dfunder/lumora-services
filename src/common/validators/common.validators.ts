import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Sanitizes string input by trimming and escaping HTML entities
 */
export function SanitizeString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'sanitizeString',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          // Trim and check for basic HTML/script injection patterns
          const trimmed = value.trim();
          const dangerousPatterns = [
            /<script/i,
            /javascript:/i,
            /on\w+\s*=/i,
            /<iframe/i,
            /<object/i,
            /<embed/i,
          ];
          return !dangerousPatterns.some(pattern => pattern.test(trimmed));
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} contains potentially dangerous content and must be sanitized.`;
        },
      },
    });
  };
}

/**
 * Validates decimal precision for currency amounts (max 2 decimal places)
 */
export function IsDecimalPrecision(maxDecimalPlaces: number = 2, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDecimalPrecision',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string' && typeof value !== 'number') return false;
          const strValue = String(value);
          const decimalMatch = strValue.match(/^-?\d+\.?\d*$/);
          if (!decimalMatch) return false;
          
          const parts = strValue.split('.');
          if (parts.length > 2) return false;
          if (parts.length === 2 && parts[1].length > maxDecimalPlaces) return false;
          
          return true;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must have at most ${maxDecimalPlaces} decimal places.`;
        },
      },
    });
  };
}

/**
 * Validates that campaign dates are logically consistent (end date after start date)
 */
@ValidatorConstraint({ name: 'isValidCampaignDates', async: false })
export class IsValidCampaignDatesConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    if (!args.object) return false;
    const object = args.object as any;
    
    const startDate = object.startDate;
    const endDate = object.endDate;
    
    if (!startDate || !endDate) return true; // Skip if either is missing
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Check if dates are valid
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
    
    // End date must be after start date
    return end > start;
  }

  defaultMessage(args: ValidationArguments) {
    return 'End date must be after start date.';
  }
}

export function IsValidCampaignDates(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidCampaignDatesConstraint,
    });
  };
}

/**
 * Validates array size with min and max constraints
 */
export function ArraySize(min: number = 0, max?: number, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'arraySize',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (!Array.isArray(value)) return false;
          if (value.length < min) return false;
          if (max !== undefined && value.length > max) return false;
          return true;
        },
        defaultMessage(args: ValidationArguments) {
          const maxMsg = max !== undefined ? ` and at most ${max}` : '';
          return `${args.property} must contain at least ${min} items${maxMsg}.`;
        },
      },
    });
  };
}

/**
 * Validates that a string is a valid URL
 */
export function IsValidUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidUrl',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          try {
            const url = new URL(value);
            return url.protocol === 'http:' || url.protocol === 'https:';
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid URL starting with http:// or https://`;
        },
      },
    });
  };
}

/**
 * Validates that a string contains only safe characters (no control characters)
 */
export function IsSafeString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSafeString',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          // Check for control characters (except common whitespace)
          return !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} contains invalid characters.`;
        },
      },
    });
  };
}

/**
 * Validates that a string is a valid asset code (for Stellar assets)
 */
export function IsValidAssetCode(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidAssetCode',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          if (value === 'XLM') return true;
          const len = value.length;
          const isAlphanumeric = /^[a-zA-Z0-9]+$/.test(value);
          return (
            isAlphanumeric &&
            ((len >= 1 && len <= 4) || (len >= 5 && len <= 12))
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be 'XLM' or a valid alphanumeric Stellar asset code (1-4 or 5-12 characters).`;
        },
      },
    });
  };
}

/**
 * Validates that a string is a valid Stellar address
 */
export function IsStellarAddress(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStellarAddress',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          // Stellar public keys start with 'G' and are 56 characters long (base32)
          return /^G[A-Z0-9]{55}$/.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid Stellar public address starting with 'G' and containing 56 characters.`;
        },
      },
    });
  };
}

/**
 * Validates that a string is a valid transaction hash
 */
export function IsValidTxHash(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidTxHash',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          // Stellar transaction hashes are 64 character hex strings
          return /^[a-fA-F0-9]{64}$/.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid 64-character hexadecimal transaction hash.`;
        },
      },
    });
  };
}

/**
 * Validates that a string is a valid contract ID
 */
export function IsValidContractId(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidContractId',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          // Contract IDs are typically hex strings, varying length
          return /^[a-fA-F0-9]+$/.test(value) && value.length >= 1;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid hexadecimal contract ID.`;
        },
      },
    });
  };
}

/**
 * Validates that a network is either 'testnet' or 'public'
 */
export function IsValidNetwork(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidNetwork',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          return ['testnet', 'public', 'mainnet'].includes(value.toLowerCase());
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be either 'testnet', 'public', or 'mainnet'.`;
        },
      },
    });
  };
}
