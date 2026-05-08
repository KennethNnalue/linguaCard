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

  async findAll(): Promise<Category[]> {
    return (await this.repo.find()).map(this.toModel);
  }

  async findOne(id: string): Promise<Category> {
    const entity = await this.repo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Category ${id} not found`);
    return this.toModel(entity);
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    const entity = this.repo.create({
      id: randomUUID(),
      userId: dto.userId,
      name: dto.name,
      colour: dto.colour ?? '#2D5A4E',
      cardCount: 0,
    });
    const saved = await this.repo.save(entity);
    return this.toModel(saved);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const entity = await this.repo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Category ${id} not found`);
    Object.assign(entity, dto);
    const saved = await this.repo.save(entity);
    return this.toModel(saved);
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
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
