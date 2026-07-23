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

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getPublicProfile(walletAddress: string): Promise<PublicProfileDto> {
    const user = await this.userRepository.findOne({
      where: { walletAddress },
      relations: ['campaigns'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const campaignCount = user.campaigns?.length ?? 0;
    const totalRaised =
      user.campaigns?.reduce((sum, c) => sum + Number(c.raisedAmount), 0) ?? 0;

    return PublicProfileDto.fromUser(user, campaignCount, totalRaised);
  }

  async searchUsers(
    query: AdminSearchQueryDto,
  ): Promise<AdminSearchResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const searchTerm = query.q ?? '';

    const where = searchTerm ? { walletAddress: ILike(`${searchTerm}%`) } : {};

    const [users, total] = await this.userRepository.findAndCount({
      where,
      relations: ['campaigns'],
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { createdAt: 'DESC' },
    });

    const data = users.map((user) => {
      const campaignCount = user.campaigns?.length ?? 0;
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
