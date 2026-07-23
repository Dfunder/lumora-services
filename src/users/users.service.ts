import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Mock computed stats for now
    const computedStats = {
      totalRaised: 0,
      totalDonated: 0,
      campaignCount: 0,
    };

    return {
      ...user,
      ...computedStats,
    };
  }

  async updateProfile(userId: string, updateUserDto: UpdateUserDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update only allowed fields
    if (updateUserDto.displayName !== undefined) user.displayName = updateUserDto.displayName;
    if (updateUserDto.bio !== undefined) user.bio = updateUserDto.bio;
    if (updateUserDto.avatarUrl !== undefined) user.avatarUrl = updateUserDto.avatarUrl;
    if (updateUserDto.socialLinks !== undefined) user.socialLinks = updateUserDto.socialLinks;

    await this.userRepository.save(user);

    return this.getProfile(userId);
  }
}
