/**
 * Category Loader
 *
 * Load data for sync categories.
 */

import type { SyncCategory, PathConfig, SyncConfig } from '../types/index.js';
import { getCategoryPaths } from '../types/paths.js';
import type { CategoryData } from '../sync/operations/types.js';
import { loadSinglePath, getPathKey } from './directory-loader.js';

export interface LoadedData {
  categories: CategoryData[];
  errors: LoadError[];
}

export interface LoadError {
  category: SyncCategory;
  path: string;
  error: Error;
}

/**
 * Load all data for enabled categories.
 */
export async function loadLocalData(
  pathConfig: PathConfig,
  enabledCategories: SyncConfig['sync']
): Promise<LoadedData> {
  const categoryPaths = getCategoryPaths(pathConfig);
  const categories: CategoryData[] = [];
  const errors: LoadError[] = [];

  for (const [category, paths] of Object.entries(categoryPaths)) {
    if (!enabledCategories[category as SyncCategory]) continue;

    try {
      const data = await loadCategoryData(category as SyncCategory, paths);
      if (data) categories.push(data);
    } catch (error) {
      const firstPath = paths[0];
      if (firstPath !== undefined) {
        errors.push({
          category: category as SyncCategory,
          path: firstPath,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }
  }

  return { categories, errors };
}

/**
 * Load data for a single category.
 */
async function loadCategoryData(
  category: SyncCategory,
  paths: string[]
): Promise<CategoryData | null> {
  const categoryData: Record<string, unknown> = {};
  let hasData = false;

  for (const basePath of paths) {
    const result = await loadSinglePath(basePath);
    if (result !== null) {
      categoryData[getPathKey(basePath)] = result;
      hasData = true;
    }
  }

  if (!hasData) return null;

  const isJsonl = category === 'state';
  return { category, data: JSON.stringify(categoryData), isJsonl };
}
