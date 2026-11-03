import rawSeed from './legacy-seed.json';
import type { AcademySnapshot } from '@/lib/types';

export const SEED_SNAPSHOT = rawSeed as unknown as AcademySnapshot;

export function createSeedSnapshot(): AcademySnapshot {
  return JSON.parse(JSON.stringify(SEED_SNAPSHOT)) as AcademySnapshot;
}
