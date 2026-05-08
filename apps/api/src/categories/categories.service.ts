import { Injectable, NotFoundException } from '@nestjs/common';
import type { Category } from '@lingua-card/shared/domain';
import { CreateCategoryDto, UpdateCategoryDto } from '@lingua-card/shared/dto';
import { randomUUID } from 'crypto';

@Injectable()
export class CategoriesService {
  private categories: Category[] = [];

  findAll(): Category[] {
    return this.categories;
  }

  findOne(id: string): Category {
    const cat = this.categories.find(c => c.id === id);
    if (!cat) throw new NotFoundException(`Category ${id} not found`);
    return cat;
  }

  create(dto: CreateCategoryDto): Category {
    const category: Category = {
      id: randomUUID(),
      userId: dto.userId,
      name: dto.name,
      colour: dto.colour ?? '#2D5A4E',
      cardCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.categories.push(category);
    return category;
  }

  update(id: string, dto: UpdateCategoryDto): Category {
    const index = this.categories.findIndex(c => c.id === id);
    if (index === -1) throw new NotFoundException(`Category ${id} not found`);
    this.categories[index] = { ...this.categories[index], ...dto };
    return this.categories[index];
  }

  remove(id: string): void {
    const index = this.categories.findIndex(c => c.id === id);
    if (index === -1) throw new NotFoundException(`Category ${id} not found`);
    this.categories.splice(index, 1);
  }
}
