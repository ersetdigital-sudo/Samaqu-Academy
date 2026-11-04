import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AcademySnapshot,
  ActivityItem,
  AssessmentAttempt,
  AssessmentSettings,
  CollectionItem,
  ContentCollections,
  ContentCollectionKey,
  LearningLevel,
  MaterialQuizQuestion,
  ProgressState,
  QuizAttempt,
} from '@/lib/types';
import type { AcademyRepository } from './repository';

const TYPE_BY_KEY: Record<ContentCollectionKey, string> = {
  materials: 'material',
  scripts: 'script',
  cases: 'case',
  beforeAfter: 'before_after',
  flow: 'flow',
  guides: 'guide',
  problems: 'problem',
  scenarios: 'scenario',
  quiz: 'quiz',
  products: 'product',
};

const KEY_BY_TYPE: Record<string, ContentCollectionKey> = Object.fromEntries(
  Object.entries(TYPE_BY_KEY).map(([key, type]) => [type, key as ContentCollectionKey]),
);

const UNSHIFT_COLLECTIONS = new Set<ContentCollectionKey>([
  'scripts',
  'cases',
  'beforeAfter',
  'products',
]);

interface ContentRow {
  id: string;
  type: string;
  sort_order: number;
  level_id?: number | null;
  is_required?: boolean | null;
  data: Record<string, unknown> | null;
  updated_at: string;
}

interface LevelRow {
  id: number;
  title: string;
  description: string | null;
  sort_order: number;
}

interface QuizQuestionRow {
  id: string;
  material_id: string;
  question: string;
  options: string[] | null;
  correct_index: number;
  explanation: string | null;
  sort_order: number;
}

interface QuizAttemptRow {
  id: string;
  material_id: string;
  score: number;
  answers: Record<string, number> | null;
  created_at: string;
}

interface ProgressRow {
  kind: string;
  item_id: string;
  status: string | null;
  progress: number | null;
  done: boolean;
  updated_at: string;
}

interface ActivityRow {
  id: string;
  type: ActivityItem['type'];
  title: string;
  score: number | null;
  ref_id: string;
  created_at: string;
}

interface AttemptRow {
  id: string;
  created_at: string;
  score: number;
  correct: number;
  total: number;
  pass: boolean;
  pass_mark: number;
  wrong: AssessmentAttempt['wrong'];
  answers: AssessmentAttempt['answers'];
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const emptyProgress = (): ProgressState => ({
  materials: {},
  guides: {},
  problems: {},
  flow: {},
  visitedProducts: false,
});

const toMillis = (value: string | null | undefined): number => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
};

function mapContent(rows: ContentRow[]): ContentCollections {
  const content: ContentCollections = {
    materials: [],
    scripts: [],
    cases: [],
    beforeAfter: [],
    flow: [],
    guides: [],
    problems: [],
    scenarios: [],
    quiz: [],
    products: [],
  };

  rows.forEach((row) => {
    const key = KEY_BY_TYPE[row.type];
    if (!key) return;
    const item = {
      ...(row.data ?? {}),
      id: row.id,
      sortOrder: Number(row.sort_order) || 0,
      updatedAt: toMillis(row.updated_at),
      ...(key === 'materials'
        ? { levelId: row.level_id ?? null, isRequired: row.is_required !== false }
        : {}),
    };
    (content[key] as unknown[]).push(item);
  });

  content.flow.sort((a, b) => a.no - b.no);
  content.guides.sort((a, b) => a.no - b.no);
  return content;
}

function mapProgress(rows: ProgressRow[]): ProgressState {
  const progress = emptyProgress();
  rows.forEach((row) => {
    if (row.kind === 'material') {
      progress.materials[row.item_id] = {
        status:
          row.status === 'done' || row.status === 'progress' || row.status === 'todo'
            ? row.status
            : row.done
              ? 'done'
              : 'todo',
        progress: row.progress ?? (row.done ? 100 : 0),
        updatedAt: toMillis(row.updated_at),
      };
    } else if (row.kind === 'guide') {
      progress.guides[row.item_id] = true;
    } else if (row.kind === 'problem') {
      progress.problems[row.item_id] = true;
    } else if (row.kind === 'flow') {
      progress.flow[row.item_id] = true;
    } else if (row.kind === 'flag' && row.item_id === 'visited_products') {
      progress.visitedProducts = true;
    }
  });
  return progress;
}

function mapActivity(rows: ActivityRow[]): ActivityItem[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    score: row.score,
    refId: row.ref_id,
    createdAt: toMillis(row.created_at),
  }));
}

function mapAttempts(rows: AttemptRow[]): AssessmentAttempt[] {
  return rows.map((row) => ({
    id: row.id,
    createdAt: toMillis(row.created_at),
    score: row.score,
    correct: row.correct,
    total: row.total,
    pass: row.pass,
    passMark: row.pass_mark,
    wrong: Array.isArray(row.wrong) ? row.wrong : [],
    answers: row.answers ?? {},
  }));
}

function mapLevels(rows: LevelRow[]): LearningLevel[] {
  return rows
    .map((row) => ({
      id: Number(row.id),
      title: row.title,
      description: row.description ?? '',
      sortOrder: Number(row.sort_order) || 0,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function mapQuizQuestions(
  rows: QuizQuestionRow[],
): Record<string, MaterialQuizQuestion[]> {
  const quizzes: Record<string, MaterialQuizQuestion[]> = {};
  rows.forEach((row) => {
    const options = Array.isArray(row.options) ? row.options.map(String) : [];
    if (options.length < 2) return;
    (quizzes[row.material_id] ??= []).push({
      id: row.id,
      materialId: row.material_id,
      question: row.question,
      options,
      correctIndex: Number(row.correct_index) || 0,
      explanation: row.explanation ?? '',
      sortOrder: Number(row.sort_order) || 0,
    });
  });
  Object.values(quizzes).forEach((list) => list.sort((a, b) => a.sortOrder - b.sortOrder));
  return quizzes;
}

function mapQuizAttempts(rows: QuizAttemptRow[]): QuizAttempt[] {
  return rows.map((row) => ({
    id: row.id,
    materialId: row.material_id,
    score: Number(row.score) || 0,
    answers: row.answers ?? {},
    createdAt: toMillis(row.created_at),
  }));
}

async function errorFrom(
  result: { error: { message: string } | null },
  fallback: string,
): Promise<never> {
  throw new Error(result.error?.message || fallback);
}

export function createSupabaseRepository(
  supabase: SupabaseClient,
  userId: string,
): AcademyRepository {
  let previousProgress: ProgressState | null = null;
  let previousActivity: ActivityItem[] = [];
  let previousAttempts: AssessmentAttempt[] = [];

  return {
    async load(): Promise<AcademySnapshot> {
      const [
        contentResult,
        progressResult,
        activityResult,
        attemptsResult,
        settingsResult,
        levelsResult,
        quizQuestionsResult,
        quizAttemptsResult,
      ] = await Promise.all([
          supabase
            .from('content_items')
            .select('id, type, sort_order, level_id, is_required, data, updated_at')
            .order('type')
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true }),
          supabase
            .from('progress')
            .select('kind, item_id, status, progress, done, updated_at')
            .eq('user_id', userId),
          supabase
            .from('activity_history')
            .select('id, type, title, score, ref_id, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(200),
          supabase
            .from('assessment_attempts')
            .select('id, created_at, score, correct, total, pass, pass_mark, wrong, answers')
            .eq('user_id', userId)
            .order('created_at', { ascending: false }),
          supabase
            .from('assessment_settings')
            .select('pass_mark')
            .eq('id', 1)
            .maybeSingle(),
          supabase
            .from('learning_levels')
            .select('id, title, description, sort_order')
            .order('sort_order', { ascending: true }),
          supabase
            .from('quiz_questions')
            .select('id, material_id, question, options, correct_index, explanation, sort_order')
            .order('sort_order', { ascending: true }),
          supabase
            .from('quiz_attempts')
            .select('id, material_id, score, answers, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false }),
        ]);

      if (contentResult.error) await errorFrom(contentResult, 'Gagal memuat konten.');
      if (progressResult.error) await errorFrom(progressResult, 'Gagal memuat progress.');
      if (activityResult.error) await errorFrom(activityResult, 'Gagal memuat aktivitas.');
      if (attemptsResult.error) await errorFrom(attemptsResult, 'Gagal memuat hasil assessment.');
      if (levelsResult.error) await errorFrom(levelsResult, 'Gagal memuat level belajar.');
      if (quizQuestionsResult.error) await errorFrom(quizQuestionsResult, 'Gagal memuat kuis materi.');
      if (quizAttemptsResult.error) await errorFrom(quizAttemptsResult, 'Gagal memuat hasil kuis.');

      const progress = mapProgress((progressResult.data ?? []) as ProgressRow[]);
      const activity = mapActivity((activityResult.data ?? []) as ActivityRow[]);
      const attempts = mapAttempts((attemptsResult.data ?? []) as AttemptRow[]);
      previousProgress = clone(progress);
      previousActivity = clone(activity);
      previousAttempts = clone(attempts);

      return {
        content: mapContent((contentResult.data ?? []) as ContentRow[]),
        levels: mapLevels((levelsResult.data ?? []) as LevelRow[]),
        materialQuizzes: mapQuizQuestions(
          (quizQuestionsResult.data ?? []) as QuizQuestionRow[],
        ),
        quizAttempts: mapQuizAttempts((quizAttemptsResult.data ?? []) as QuizAttemptRow[]),
        progress,
        activity,
        attempts,
        settings: {
          passMark: settingsResult.data?.pass_mark ?? 75,
        },
      };
    },

    async upsertContent<K extends ContentCollectionKey>(
      key: K,
      item: CollectionItem<K>,
    ): Promise<void> {
      const type = TYPE_BY_KEY[key];
      // sortOrder hanya untuk materi (kolom content_items.sort_order), bukan bagian data JSONB.
      const {
        id,
        sortOrder: requestedOrder,
        levelId,
        isRequired,
        ...data
      } = item as unknown as Record<string, unknown> & { id: string; sortOrder?: number };

      const { data: existing } = await supabase
        .from('content_items')
        .select('sort_order')
        .eq('id', id)
        .maybeSingle();

      let sortOrder =
        type === 'material' && typeof requestedOrder === 'number' && requestedOrder > 0
          ? requestedOrder
          : (existing?.sort_order as number | undefined);
      if (sortOrder == null) {
        if (type === 'flow' || type === 'guide') {
          sortOrder = Number((data as { no?: number }).no ?? 0);
        } else if (UNSHIFT_COLLECTIONS.has(key)) {
          sortOrder = -Date.now();
        } else {
          sortOrder = Date.now();
        }
      }

      const { error } = await supabase.from('content_items').upsert(
        {
          id,
          type,
          sort_order: sortOrder,
          data,
          updated_at: new Date().toISOString(),
          ...(type === 'material'
            ? { level_id: levelId == null ? null : Number(levelId), is_required: isRequired !== false }
            : {}),
        },
        { onConflict: 'id' },
      );
      if (error) throw new Error(error.message);
    },

    async deleteContent(key: ContentCollectionKey, id: string): Promise<void> {
      const { error } = await supabase.from('content_items').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },

    async saveProgress(progress: ProgressState): Promise<void> {
      const previous = previousProgress ?? emptyProgress();
      const rows: Record<string, unknown>[] = [];
      const deletes: { kind: string; itemId: string }[] = [];
      const now = new Date().toISOString();

      const materialIds = new Set([
        ...Object.keys(previous.materials),
        ...Object.keys(progress.materials),
      ]);
      materialIds.forEach((itemId) => {
        const before = previous.materials[itemId];
        const after = progress.materials[itemId];
        if (JSON.stringify(before) === JSON.stringify(after)) return;
        if (after) {
          rows.push({
            user_id: userId,
            kind: 'material',
            item_id: itemId,
            status: after.status,
            progress: after.progress,
            done: after.status === 'done',
            updated_at: now,
          });
        } else {
          deletes.push({ kind: 'material', itemId });
        }
      });

      const flagSources: [string, Record<string, boolean>, Record<string, boolean>][] = [
        ['guide', previous.guides, progress.guides],
        ['problem', previous.problems, progress.problems],
        ['flow', previous.flow, progress.flow],
      ];
      flagSources.forEach(([kind, before, after]) => {
        const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
        ids.forEach((itemId) => {
          const was = Boolean(before[itemId]);
          const is = Boolean(after[itemId]);
          if (was === is) return;
          if (is) {
            rows.push({
              user_id: userId,
              kind,
              item_id: itemId,
              status: null,
              progress: null,
              done: true,
              updated_at: now,
            });
          } else {
            deletes.push({ kind, itemId });
          }
        });
      });

      if (previous.visitedProducts !== progress.visitedProducts) {
        if (progress.visitedProducts) {
          rows.push({
            user_id: userId,
            kind: 'flag',
            item_id: 'visited_products',
            status: null,
            progress: null,
            done: true,
            updated_at: now,
          });
        } else {
          deletes.push({ kind: 'flag', itemId: 'visited_products' });
        }
      }

      if (rows.length) {
        const { error } = await supabase
          .from('progress')
          .upsert(rows, { onConflict: 'user_id,kind,item_id' });
        if (error) throw new Error(error.message);
      }

      await Promise.all(
        deletes.map(({ kind, itemId }) =>
          supabase
            .from('progress')
            .delete()
            .eq('user_id', userId)
            .eq('kind', kind)
            .eq('item_id', itemId),
        ),
      );

      previousProgress = clone(progress);
    },

    async saveActivity(items: ActivityItem[]): Promise<void> {
      const known = new Set(previousActivity.map((item) => item.id));
      const additions = items.filter((item) => !known.has(item.id));
      if (additions.length) {
        const { error } = await supabase.from('activity_history').upsert(
          additions.map((item) => ({
            id: item.id,
            user_id: userId,
            type: item.type,
            title: item.title,
            score: item.score,
            ref_id: item.refId,
            created_at: new Date(item.createdAt).toISOString(),
          })),
          { onConflict: 'id', ignoreDuplicates: true },
        );
        if (error) throw new Error(error.message);
      }
      previousActivity = clone(items);
    },

    async saveAttempts(items: AssessmentAttempt[]): Promise<void> {
      const known = new Set(previousAttempts.map((item) => item.id));
      const additions = items.filter((item) => !known.has(item.id));
      if (additions.length) {
        const { error } = await supabase.from('assessment_attempts').upsert(
          additions.map((item) => ({
            id: item.id,
            user_id: userId,
            created_at: new Date(item.createdAt).toISOString(),
            score: item.score,
            correct: item.correct,
            total: item.total,
            pass: item.pass,
            pass_mark: item.passMark,
            wrong: item.wrong,
            answers: item.answers,
          })),
          { onConflict: 'id', ignoreDuplicates: true },
        );
        if (error) throw new Error(error.message);
      }
      previousAttempts = clone(items);
    },

    async saveQuizAttempt(attempt: QuizAttempt): Promise<void> {
      const { error } = await supabase.from('quiz_attempts').upsert(
        {
          id: attempt.id,
          user_id: userId,
          material_id: attempt.materialId,
          score: attempt.score,
          answers: attempt.answers,
          created_at: new Date(attempt.createdAt).toISOString(),
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message);
    },

    async saveQuizQuestion(question: MaterialQuizQuestion): Promise<void> {
      const { error } = await supabase.from('quiz_questions').upsert(
        {
          id: question.id,
          material_id: question.materialId,
          question: question.question,
          options: question.options,
          correct_index: question.correctIndex,
          explanation: question.explanation,
          sort_order: question.sortOrder,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
      if (error) throw new Error(error.message);
    },

    async deleteQuizQuestion(id: string): Promise<void> {
      const { error } = await supabase.from('quiz_questions').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },

    async saveSettings(settings: AssessmentSettings): Promise<void> {
      const { error } = await supabase.from('assessment_settings').upsert(
        {
          id: 1,
          pass_mark: settings.passMark,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
      if (error) throw new Error(error.message);
    },

  };
}
