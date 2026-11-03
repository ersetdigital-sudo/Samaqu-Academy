import type {
  ActivityItem,
  AssessmentAttempt,
  ContentCollections,
  ProgressState,
} from './types';

export interface MaterialStats {
  total: number;
  done: number;
  pct: number;
}

export function materialStats(
  materials: ContentCollections['materials'],
  progress: ProgressState,
): MaterialStats {
  const total = materials.length;
  const done = materials.filter(
    (material) => progress.materials[material.id]?.status === 'done',
  ).length;
  const pct = total
    ? Math.round(
        materials.reduce(
          (sum, material) => sum + (progress.materials[material.id]?.progress ?? 0),
          0,
        ) / total,
      )
    : 0;
  return { total, done, pct };
}

export function bestScore(attempts: AssessmentAttempt[]): number | null {
  return attempts.length ? Math.max(...attempts.map((attempt) => attempt.score)) : null;
}

export function scenarioAttempts(activity: ActivityItem[], scenarioId: string): ActivityItem[] {
  return activity.filter((item) => item.type === 'scenario' && item.refId === scenarioId);
}

export function guideDoneCount(
  guides: ContentCollections['guides'],
  progress: ProgressState,
): number {
  return guides.filter((guide) => progress.guides[guide.id]).length;
}

export function problemsSeenCount(
  problems: ContentCollections['problems'],
  progress: ProgressState,
): number {
  return problems.filter((problem) => progress.problems[problem.id]).length;
}

export function distinctScenarioCount(activity: ActivityItem[]): number {
  return new Set(
    activity.filter((item) => item.type === 'scenario' && item.refId).map((item) => item.refId),
  ).size;
}
