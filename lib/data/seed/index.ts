import rawSeed from './legacy-seed.json';
import { DEFAULT_LEVELS } from '@/lib/learning';
import type { AcademySnapshot } from '@/lib/types';

export const SEED_SNAPSHOT = rawSeed as unknown as AcademySnapshot;

export function createSeedSnapshot(): AcademySnapshot {
  const snapshot = JSON.parse(JSON.stringify(SEED_SNAPSHOT)) as AcademySnapshot;
  return {
    ...snapshot,
    levels: snapshot.levels?.length ? snapshot.levels : DEFAULT_LEVELS,
    materialQuizzes: snapshot.materialQuizzes ?? {},
    quizAttempts: snapshot.quizAttempts ?? [],
  };
}
