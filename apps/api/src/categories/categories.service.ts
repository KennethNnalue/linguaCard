import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type { Category } from '@lingua-card/shared/domain';
import { CreateCategoryDto, UpdateCategoryDto } from '@lingua-card/shared/dto';
import { CategoryEntity } from './category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly repo: Repository<CategoryEntity>,
  ) {}

  async findAll(userId: string): Promise<Category[]> {
    return (await this.repo.find({ where: { userId } })).map(this.toModel);
  }

  async findOne(userId: string, id: string): Promise<Category> {
    const entity = await this.repo.findOneBy({ id, userId });
    if (!entity) throw new NotFoundException(`Category ${id} not found`);
    return this.toModel(entity);
  }

  async create(userId: string, dto: CreateCategoryDto): Promise<Category> {
    const entity = this.repo.create({
      id: randomUUID(),
      userId,
      name: dto.name,
      colour: dto.colour ?? '#2D5A4E',
      cardCount: 0,
    });
    const saved = await this.repo.save(entity);
    return this.toModel(saved);
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto): Promise<Category> {
    const entity = await this.repo.findOneBy({ id, userId });
    if (!entity) throw new NotFoundException(`Category ${id} not found`);
    Object.assign(entity, dto);
    const saved = await this.repo.save(entity);
    return this.toModel(saved);
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.repo.delete({ id, userId });
    if (!result.affected) throw new NotFoundException(`Category ${id} not found`);
  }

  private toModel(e: CategoryEntity): Category {
    return {
      id: e.id,
      userId: e.userId,
      name: e.name,
      colour: e.colour,
      cardCount: e.cardCount,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    };
  }
}
