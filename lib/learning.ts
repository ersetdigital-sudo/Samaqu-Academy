import type {
  LearningLevel,
  Material,
  MaterialProgress,
  MaterialQuizQuestion,
  ProgressState,
  QuizAttempt,
} from './types';

/**
 * Konfigurasi jalur belajar.
 * Ubah nilai di sini untuk menyesuaikan ambang lulus atau mematikan kunci level.
 */
export const LEARNING_CONFIG = {
  /** Ambang lulus kuis materi (persen). */
  passMark: 80,
  /** Progres kartu setelah materi dibuka / video ditonton. */
  openedProgress: 50,
  /** Progres kartu setelah lulus kuis (atau ditandai selesai). */
  doneProgress: 100,
  /** Level berikutnya terkunci sampai materi wajib level sebelumnya selesai. */
  lockLevels: true,
} as const;

/** Cadangan bila tabel learning_levels belum termuat (mis. snapshot seed). */
export const DEFAULT_LEVELS: LearningLevel[] = [
  {
    id: 1,
    title: 'Onboarding & Fundamental',
    description: 'Dasar brand, nilai pelayanan, dan standar komunikasi Samaqu.',
    sortOrder: 1,
  },
  {
    id: 2,
    title: 'Product & Business Knowledge',
    description: 'Series thobe, perbedaan thobe dan kandora, serta harga dan open order.',
    sortOrder: 2,
  },
  {
    id: 3,
    title: 'Customer Service Operations',
    description: 'Alur layanan harian, pemrosesan pesanan, dan koordinasi dengan tim.',
    sortOrder: 3,
  },
  {
    id: 4,
    title: 'Problem Solving & Communication',
    description: 'Menangani pertanyaan sulit, keberatan customer, dan eskalasi.',
    sortOrder: 4,
  },
  {
    id: 5,
    title: 'Practice & Assessment',
    description: 'Latihan simulasi dan asesmen akhir sebelum terjun ke percakapan nyata.',
    sortOrder: 5,
  },
];

export interface LearningLevelGroup {
  level: LearningLevel;
  materials: Material[];
  done: number;
  total: number;
  percent: number;
  locked: boolean;
}

function statusOf(progress: ProgressState, materialId: string): MaterialProgress['status'] {
  return progress.materials[materialId]?.status ?? 'todo';
}

function allRequiredDone(materials: Material[], progress: ProgressState): boolean {
  return materials
    .filter((material) => material.isRequired !== false)
    .every((material) => statusOf(progress, material.id) === 'done');
}

/**
 * Kelompokkan materi per level, plus status kunci level berikutnya.
 * `lockLevels` dimatikan untuk owner/leader: semua level langsung terbuka.
 */
export function groupMaterialsByLevel(
  levels: LearningLevel[],
  materials: Material[],
  progress: ProgressState,
  options: { lockLevels?: boolean } = {},
): LearningLevelGroup[] {
  const lockLevels = options.lockLevels ?? LEARNING_CONFIG.lockLevels;
  const sortedLevels = levels.length ? levels : DEFAULT_LEVELS;
  const ordered = [...sortedLevels].sort((a, b) => a.sortOrder - b.sortOrder);

  let previousHasMaterials = false;
  let previousComplete = true;

  const groups = ordered.map((level) => {
    const levelMaterials = materials.filter((material) => material.levelId === level.id);
    const total = levelMaterials.length;
    const done = levelMaterials.filter((material) => statusOf(progress, material.id) === 'done')
      .length;
    // Level kosong tidak dikunci: hanya tampil sebagai "Segera hadir".
    const locked = total > 0 && lockLevels && previousHasMaterials && !previousComplete;

    if (total) {
      previousHasMaterials = true;
      previousComplete = allRequiredDone(levelMaterials, progress);
    }

    return {
      level,
      materials: levelMaterials,
      done,
      total,
      percent: total ? Math.round((done / total) * 100) : 0,
      locked,
    } satisfies LearningLevelGroup;
  });

  const unassigned = materials.filter(
    (material) => !ordered.some((level) => level.id === material.levelId),
  );
  if (unassigned.length) {
    const done = unassigned.filter((material) => statusOf(progress, material.id) === 'done').length;
    groups.push({
      level: { id: 0, title: 'Materi lain', description: '', sortOrder: 0 },
      materials: unassigned,
      done,
      total: unassigned.length,
      percent: Math.round((done / unassigned.length) * 100),
      locked: false,
    });
  }

  return groups;
}

export function isMaterialLocked(groups: LearningLevelGroup[], materialId: string): boolean {
  return groups.some(
    (group) => group.locked && group.materials.some((material) => material.id === materialId),
  );
}

export function quizBestScore(attempts: QuizAttempt[], materialId: string): number | null {
  const scores = attempts.filter((attempt) => attempt.materialId === materialId).map((a) => a.score);
  return scores.length ? Math.max(...scores) : null;
}

export function quizFor(
  quizzes: Record<string, MaterialQuizQuestion[]>,
  materialId: string,
): MaterialQuizQuestion[] {
  return quizzes[materialId] ?? [];
}
