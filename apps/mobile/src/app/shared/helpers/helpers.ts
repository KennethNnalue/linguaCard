import {Category} from "../../core/models/mock-data";

export const getCategoryName = (id: string, categories: Category[]): string => {
  const category = categories.find(cat => cat.id === id);
  return category ? category.name : '';
}
