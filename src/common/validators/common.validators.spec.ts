import { validate } from 'class-validator';
import {
  SanitizeString,
  IsDecimalPrecision,
  IsValidCampaignDates,
  ArraySize,
  IsValidUrl,
  IsSafeString,
  IsValidAssetCode,
  IsStellarAddress,
  IsValidTxHash,
  IsValidContractId,
  IsValidNetwork,
} from './common.validators';

class TestDto {
  @SanitizeString()
  testString: string;
}

class DecimalDto {
  @IsDecimalPrecision(2)
  amount: string;
}

class CampaignDatesDto {
  startDate: string;
  endDate: string;

  @IsValidCampaignDates()
  endDateValidation: string;
}

class ArraySizeDto {
  @ArraySize(1, 5)
  items: any[];
}

class UrlDto {
  @IsValidUrl()
  url: string;
}

class SafeStringDto {
  @IsSafeString()
  text: string;
}

class AssetCodeDto {
  @IsValidAssetCode()
  assetCode: string;
}

class StellarAddressDto {
  @IsStellarAddress()
  address: string;
}

class TxHashDto {
  @IsValidTxHash()
  hash: string;
}

class ContractIdDto {
  @IsValidContractId()
  contractId: string;
}

class NetworkDto {
  @IsValidNetwork()
  network: string;
}

describe('Common Validators', () => {
  describe('SanitizeString', () => {
    it('should accept safe strings', async () => {
      const dto = new TestDto();
      dto.testString = 'Hello World';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject strings with script tags', async () => {
      const dto = new TestDto();
      dto.testString = '<script>alert("xss")</script>';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('sanitizeString');
    });

    it('should reject strings with javascript: protocol', async () => {
      const dto = new TestDto();
      dto.testString = 'javascript:alert("xss")';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject strings with iframe tags', async () => {
      const dto = new TestDto();
      dto.testString = '<iframe src="evil.com"></iframe>';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject strings with onerror handlers', async () => {
      const dto = new TestDto();
      dto.testString = '<img onerror="alert(1)" src="x">';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IsDecimalPrecision', () => {
    it('should accept valid decimal with correct precision', async () => {
      const dto = new DecimalDto();
      dto.amount = '100.50';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept integers', async () => {
      const dto = new DecimalDto();
      dto.amount = '100';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject decimals with too many places', async () => {
      const dto = new DecimalDto();
      dto.amount = '100.505';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isDecimalPrecision');
    });

    it('should reject non-numeric strings', async () => {
      const dto = new DecimalDto();
      dto.amount = 'abc';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept negative decimals', async () => {
      const dto = new DecimalDto();
      dto.amount = '-50.25';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('IsValidCampaignDates', () => {
    it('should accept valid date range', async () => {
      const dto = new CampaignDatesDto();
      dto.startDate = '2024-01-01T00:00:00Z';
      dto.endDate = '2024-12-31T23:59:59Z';
      dto.endDateValidation = dto.endDate;
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject end date before start date', async () => {
      const dto = new CampaignDatesDto();
      dto.startDate = '2024-12-31T23:59:59Z';
      dto.endDate = '2024-01-01T00:00:00Z';
      dto.endDateValidation = dto.endDate;
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isValidCampaignDates');
    });

    it('should skip validation if dates are missing', async () => {
      const dto = new CampaignDatesDto();
      dto.startDate = '';
      dto.endDate = '';
      dto.endDateValidation = dto.endDate;
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('ArraySize', () => {
    it('should accept array within size limits', async () => {
      const dto = new ArraySizeDto();
      dto.items = [1, 2, 3];
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject array below minimum size', async () => {
      const dto = new ArraySizeDto();
      dto.items = [];
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('arraySize');
    });

    it('should reject array above maximum size', async () => {
      const dto = new ArraySizeDto();
      dto.items = [1, 2, 3, 4, 5, 6];
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('arraySize');
    });

    it('should reject non-array values', async () => {
      const dto = new ArraySizeDto();
      dto.items = 'not an array' as any;
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IsValidUrl', () => {
    it('should accept valid http URLs', async () => {
      const dto = new UrlDto();
      dto.url = 'http://example.com';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept valid https URLs', async () => {
      const dto = new UrlDto();
      dto.url = 'https://example.com/path?query=value';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject ftp URLs', async () => {
      const dto = new UrlDto();
      dto.url = 'ftp://example.com';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isValidUrl');
    });

    it('should reject invalid URLs', async () => {
      const dto = new UrlDto();
      dto.url = 'not-a-url';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject URLs without protocol', async () => {
      const dto = new UrlDto();
      dto.url = 'example.com';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IsSafeString', () => {
    it('should accept safe strings', async () => {
      const dto = new SafeStringDto();
      dto.text = 'Hello World 123!';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject strings with control characters', async () => {
      const dto = new SafeStringDto();
      dto.text = 'Hello\x00World';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isSafeString');
    });

    it('should accept strings with normal whitespace', async () => {
      const dto = new SafeStringDto();
      dto.text = 'Hello World\nNew Line';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('IsValidAssetCode', () => {
    it('should accept XLM', async () => {
      const dto = new AssetCodeDto();
      dto.assetCode = 'XLM';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept 1-4 character alphanumeric codes', async () => {
      const dto = new AssetCodeDto();
      dto.assetCode = 'USDC';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept 5-12 character alphanumeric codes', async () {
      const dto = new AssetCodeDto();
      dto.assetCode = 'CUSTOM12';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject non-alphanumeric codes', async () => {
      const dto = new AssetCodeDto();
      dto.assetCode = 'US$D';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isValidAssetCode');
    });

    it('should reject codes with invalid length (5 characters not allowed)', async () => {
      const dto = new AssetCodeDto();
      dto.assetCode = 'ABCDE';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IsStellarAddress', () => {
    it('should accept valid Stellar public key', async () => {
      const dto = new StellarAddressDto();
      dto.address = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGXWKZMWL4M7RFCNARX6DOX';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject addresses not starting with G', async () => {
      const dto = new StellarAddressDto();
      dto.address = 'ACEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGXWKZMWL4M7RFCNARX6DOX';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isStellarAddress');
    });

    it('should reject addresses with wrong length', async () => {
      const dto = new StellarAddressDto();
      dto.address = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGXWKZMWL4M7RFCNARX6DO';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject non-string values', async () => {
      const dto = new StellarAddressDto();
      dto.address = 123 as any;
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IsValidTxHash', () => {
    it('should accept valid 64-character hex hash', async () => {
      const dto = new TxHashDto();
      dto.hash = 'a'.repeat(64);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept mixed case hex hash', async () => {
      const dto = new TxHashDto();
      dto.hash = 'ABCDEF1234567890abcdef1234567890ABCDEF1234567890abcdef1234567890';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject hashes with wrong length', async () => {
      const dto = new TxHashDto();
      dto.hash = 'abc123';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isValidTxHash');
    });

    it('should reject non-hex characters', async () => {
      const dto = new TxHashDto();
      dto.hash = 'g'.repeat(64);
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IsValidContractId', () => {
    it('should accept valid hex contract ID', async () => {
      const dto = new ContractIdDto();
      dto.contractId = 'abc123def456';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept uppercase hex contract ID', async () => {
      const dto = new ContractIdDto();
      dto.contractId = 'ABC123DEF456';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject non-hex characters', async () => {
      const dto = new ContractIdDto();
      dto.contractId = 'xyz123';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isValidContractId');
    });

    it('should reject empty strings', async () => {
      const dto = new ContractIdDto();
      dto.contractId = '';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IsValidNetwork', () => {
    it('should accept testnet', async () => {
      const dto = new NetworkDto();
      dto.network = 'testnet';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept public', async () => {
      const dto = new NetworkDto();
      dto.network = 'public';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept mainnet', async () => {
      const dto = new NetworkDto();
      dto.network = 'mainnet';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept case-insensitive network names', async () => {
      const dto = new NetworkDto();
      dto.network = 'TESTNET';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid network names', async () => {
      const dto = new NetworkDto();
      dto.network = 'custom-network';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isValidNetwork');
    });
  });
});
