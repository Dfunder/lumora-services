import { User } from '../../auth/entities/user.entity';

export class PublicProfileDto {
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  verifiedStatus: boolean;
  campaignCount: number;
  totalRaised: number;

  static fromUser(
    user: User,
    campaignCount: number,
    totalRaised: number,
  ): PublicProfileDto {
    return {
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio ?? null,
      verifiedStatus: user.verifiedStatus,
      campaignCount,
      totalRaised,
    };
  }
}
