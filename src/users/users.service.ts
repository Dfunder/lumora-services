import correlation from '../common/correlation/correlation.service';
import { logger } from '../common/logger/logger';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { PublicProfileDto } from './dto/public-profile.dto';
import {
  AdminSearchResultItemDto,
  AdminSearchResponseDto,
} from './dto/admin-search-result.dto';
import { AdminSearchQueryDto } from './dto/admin-search-query.dto';
import { CacheKey } from '../common/decorators/cache.decorator';
import { RedisService } from '../redis/redis.service';
import { QueryPerformance } from '../common/decorators/query-performance.decorator';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly redisService: RedisService,
  ) {}

  @QueryPerformance({ logThreshold: 100 })
  @CacheKey({ key: (walletAddress: string) => `user:profile:${walletAddress}`, ttl: 300 })
  async getPublicProfile(walletAddress: string): Promise<PublicProfileDto> {
    const ctx = correlation.get();
    logger.info('users.getPublicProfile.start', { walletAddress, correlationId: ctx.correlationId });
    const user = await this.userRepository.findOne({
      where: { walletAddress },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Optimized: Use aggregation to get campaign stats without loading all campaigns
    const campaignStats = await this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.campaigns', 'campaign')
      .select('COUNT(DISTINCT campaign.id)', 'campaignCount')
      .addSelect('COALESCE(SUM(campaign.raisedAmount), 0)', 'totalRaised')
      .where('user.walletAddress = :walletAddress', { walletAddress })
      .getRawOne();

    const campaignCountNum = parseInt(campaignStats.campaignCount) || 0;
    const totalRaised = Number(campaignStats.totalRaised) || 0;

    return PublicProfileDto.fromUser(user, campaignCountNum, totalRaised);
  }

  async searchUsers(
    query: AdminSearchQueryDto,
  ): Promise<AdminSearchResponseDto> {
    const ctx = correlation.get();
    logger.info('users.searchUsers.start', { query, correlationId: ctx.correlationId });
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const searchTerm = query.q ?? '';

    const where = searchTerm ? { walletAddress: ILike(`${searchTerm}%`) } : {};

    const [users, total] = await this.userRepository.findAndCount({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { createdAt: 'DESC' },
    });

    // Optimized: Get campaign counts in bulk rather than loading all campaigns
    const userIds = users.map(u => u.id);
    const campaignCounts = await this.userRepository
      .createQueryBuilder('user')
      .select('user.id', 'userId')
      .addSelect('COALESCE(COUNT(campaign.id), 0)', 'campaignCount')
      .leftJoin('user.campaigns', 'campaign')
      .where('user.id IN (:...userIds)', { userIds })
      .groupBy('user.id')
      .getRawMany();

    const campaignCountMap = new Map(
      campaignCounts.map(cc => [cc.userId, parseInt(cc.campaignCount)])
    );

    const data = users.map((user) => {
      const campaignCount = campaignCountMap.get(user.id) ?? 0;
      return AdminSearchResultItemDto.fromUser(user, campaignCount);
    });

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
