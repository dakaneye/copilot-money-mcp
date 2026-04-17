import { z } from 'zod';
import type { CacheStatus, LocalStore } from '../localstore/index.js';

export const getCacheStatusInputSchema = z.object({});

export type GetCacheStatusInput = z.infer<typeof getCacheStatusInputSchema>;

export async function getCacheStatus(store: LocalStore): Promise<CacheStatus> {
  return store.getCacheStatus();
}
