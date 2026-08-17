import { User } from '../../auth/entities/user.entity';

export class AdminSearchResultItemDto {
  id: string;
  walletAddress: string;
  displayName: string | null;
  role: string;
  kycStatus: string;
  campaignCount: number;

  static fromUser(user: User, campaignCount: number): AdminSearchResultItemDto {
    return {
      id: user.id,
      walletAddress: user.walletAddress,
      displayName: user.displayName ?? null,
      role: user.role,
      kycStatus: user.kycStatus,
      campaignCount,
    };
  }
}

export class AdminSearchResponseDto {
  data: AdminSearchResultItemDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
