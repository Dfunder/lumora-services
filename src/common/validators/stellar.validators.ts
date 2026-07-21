import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { StrKey } from '@stellar/stellar-sdk';

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
          return StrKey.isValidEd25519PublicKey(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid Stellar public address starting with 'G' and containing a valid checksum.`;
        },
      },
    });
  };
}

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
