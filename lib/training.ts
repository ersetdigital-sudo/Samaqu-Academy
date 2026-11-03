import {
  bestScore,
  distinctScenarioCount,
  guideDoneCount,
  materialStats,
  problemsSeenCount,
} from './stats';
import type {
  AcademySnapshot,
  ActivityItem,
  AssessmentAttempt,
  ContentCollections,
  ProgressState,
} from './types';

export interface TrainingContext {
  content: ContentCollections;
  progress: ProgressState;
  activity: ActivityItem[];
  attempts: AssessmentAttempt[];
  passMark: number;
}

export interface TrainingTask {
  label: string;
  href: string;
  minMinutes: number;
  done: (context: TrainingContext) => boolean;
}

export interface TrainingStage {
  id: string;
  title: string;
  objectives: string[];
  categories: string[];
  tasks: TrainingTask[];
}

export interface StageItem {
  kind: 'material' | 'task';
  material?: ContentCollections['materials'][number];
  task?: TrainingTask;
  done: boolean;
}

export interface StageProgress {
  items: StageItem[];
  done: number;
  total: number;
  pct: number;
  minutes: number;
}

function flowSeen(context: TrainingContext, ids: string[]): boolean {
  return ids.every(
    (id) =>
      !context.content.flow.some((stage) => stage.id === id) || Boolean(context.progress.flow[id]),
  );
}

export const TRAINING_STAGES: TrainingStage[] = [
  {
    id: 't1',
    title: 'Orientation',
    objectives: [
      'Mengenal Samaqu dan nilai pelayanannya',
      'Memahami peran admin CS sebagai wajah brand',
    ],
    categories: ['Introduction to Samaqu'],
    tasks: [],
  },
  {
    id: 't2',
    title: 'Communication & Customer Service Fundamentals',
    objectives: [
      'Berkomunikasi natural sesuai tone Samaqu',
      'Menerapkan empati dan memahami konteks',
    ],
    categories: ['Communication Guidelines', 'Customer Service Fundamentals'],
    tasks: [
      {
        label: 'Pahami semua bagian Communication Guidelines',
        href: '/guidelines',
        minMinutes: 25,
        done: (context) =>
          context.content.guides.length > 0 &&
          guideDoneCount(context.content.guides, context.progress) >=
            context.content.guides.length,
      },
    ],
  },
  {
    id: 't3',
    title: 'Product Knowledge & Consultation',
    objectives: [
      'Menjelaskan produk berdasarkan data resmi',
      'Merekomendasikan ukuran dan seri yang tepat',
    ],
    categories: ['Product Knowledge'],
    tasks: [
      {
        label: 'Pelajari tahap Chat Flow 1–4',
        href: '/flow',
        minMinutes: 15,
        done: (context) => flowSeen(context, ['flow_1', 'flow_2', 'flow_3', 'flow_4']),
      },
      {
        label: 'Jelajahi Product Knowledge',
        href: '/products',
        minMinutes: 15,
        done: (context) => Boolean(context.progress.visitedProducts),
      },
    ],
  },
  {
    id: 't4',
    title: 'Order & Payment Process',
    objectives: [
      'Membuat ringkasan pesanan yang akurat',
      'Memverifikasi pembayaran dengan benar',
    ],
    categories: ['Ordering & Payment Process'],
    tasks: [
      {
        label: 'Pelajari tahap Checkout & Order Confirmation',
        href: '/flow',
        minMinutes: 10,
        done: (context) => flowSeen(context, ['flow_5', 'flow_6']),
      },
    ],
  },
  {
    id: 't5',
    title: 'Shipping & After Sales',
    objectives: [
      'Menginformasikan pengiriman tanpa janji berlebihan',
      'Melakukan follow up purna jual',
    ],
    categories: ['Shipping & Delivery', 'After Sales Service'],
    tasks: [
      {
        label: 'Pelajari tahap After Sales',
        href: '/flow',
        minMinutes: 5,
        done: (context) => flowSeen(context, ['flow_7']),
      },
    ],
  },
  {
    id: 't6',
    title: 'Problem Solving',
    objectives: ['Menangani komplain dengan HEARD', 'Tahu kapan harus eskalasi'],
    categories: ['Complaint Handling'],
    tasks: [
      {
        label: 'Pelajari minimal 5 kasus Problem Solving',
        href: '/problems',
        minMinutes: 30,
        done: (context) => problemsSeenCount(context.content.problems, context.progress) >= 5,
      },
      {
        label: 'Pelajari jalur Complaint Handling di Chat Flow',
        href: '/flow?stage=flow_8',
        minMinutes: 5,
        done: (context) => flowSeen(context, ['flow_8']),
      },
    ],
  },
  {
    id: 't7',
    title: 'Practical Chat Scenario',
    objectives: [
      'Mempraktikkan percakapan dari awal sampai akhir',
      'Lulus assessment akhir',
    ],
    categories: [],
    tasks: [
      {
        label: 'Selesaikan 3 Chat Scenario berbeda',
        href: '/simulator',
        minMinutes: 30,
        done: (context) => distinctScenarioCount(context.activity) >= 3,
      },
      {
        label: 'Lulus Assessment',
        href: '/training?tab=assessment',
        minMinutes: 15,
        done: (context) => {
          const score = bestScore(context.attempts);
          return score != null && score >= context.passMark;
        },
      },
    ],
  },
];

export function getStageProgress(
  stage: TrainingStage,
  context: TrainingContext,
): StageProgress {
  const materials = context.content.materials.filter((material) =>
    stage.categories.includes(material.category),
  );
  const items: StageItem[] = [
    ...materials.map((material) => ({
      kind: 'material' as const,
      material,
      done: context.progress.materials[material.id]?.status === 'done',
    })),
    ...stage.tasks.map((task) => ({
      kind: 'task' as const,
      task,
      done: task.done(context),
    })),
  ];
  const done = items.filter((item) => item.done).length;
  const minutes =
    materials.reduce((sum, material) => sum + material.durationMinutes, 0) +
    stage.tasks.reduce((sum, task) => sum + task.minMinutes, 0);
  return {
    items,
    done,
    total: items.length,
    pct: items.length ? Math.round((done / items.length) * 100) : 0,
    minutes,
  };
}

export function getTrainingProgress(context: TrainingContext): number {
  const progress = TRAINING_STAGES.map((stage) => getStageProgress(stage, context));
  const total = progress.reduce((sum, stage) => sum + stage.total, 0);
  const done = progress.reduce((sum, stage) => sum + stage.done, 0);
  return total ? Math.round((done / total) * 100) : 0;
}

export function getNextStep(context: TrainingContext): { label: string; href: string } {
  for (const stage of TRAINING_STAGES) {
    const progress = getStageProgress(stage, context);
    const next = progress.items.find((item) => !item.done);
    if (next) {
      if (next.kind === 'material' && next.material) {
        return {
          label: `Lanjut: ${next.material.title}`,
          href: `/learning?id=${encodeURIComponent(next.material.id)}`,
        };
      }
      if (next.task) {
        return {
          label: `Lanjut: ${next.task.label}`,
          href: next.task.href,
        };
      }
    }
  }
  return { label: 'Ulangi latihan Chat Scenario', href: '/simulator' };
}

export function buildTrainingContext(snapshot: AcademySnapshot): TrainingContext {
  return {
    content: snapshot.content,
    progress: snapshot.progress,
    activity: snapshot.activity,
    attempts: snapshot.attempts,
    passMark: snapshot.settings.passMark,
  };
}

export function materialSummary(snapshot: AcademySnapshot) {
  return materialStats(snapshot.content.materials, snapshot.progress);
}
