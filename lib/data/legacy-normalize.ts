import {
  CASE_MARKS,
  DEFAULT_PASS_MARK,
  MATERIAL_CATEGORIES,
  PRODUCT_CATEGORIES,
  SCRIPT_CATEGORIES,
} from '@/lib/constants';
import type {
  AcademySnapshot,
  ActivityItem,
  AssessmentAttempt,
  AssessmentSettings,
  BeforeAfter,
  CaseStudy,
  ContentCollections,
  FlowStage,
  GuideSection,
  Material,
  Problem,
  Product,
  ProductCategory,
  ProgressState,
  QuizQuestion,
  Scenario,
  Script,
  Severity,
  MaterialStatus,
} from '@/lib/types';

type Legacy = Record<string, any>;

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : value == null ? fallback : String(value);

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
};

const asNumberString = (value: unknown): string =>
  value === '' || value == null ? '' : String(value);

const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const now = () => Date.now();

export function htmlToText(html: string): string {
  return String(html ?? '')
    .replace(/<h3>(.*?)<\/h3>/g, '\n## $1\n')
    .replace(/<li>(.*?)<\/li>/g, '- $1\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/p>/g, '\n\n')
    .replace(/<b>(.*?)<\/b>/g, '**$1**')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeBody(body: string): string {
  return /<(h3|p|ul|li|br)\b/i.test(body) ? htmlToText(body) : body;
}

export function normalizeMaterials(items: Legacy[] = []): Material[] {
  return items.filter(Boolean).map((item, index) => ({
    id: asString(item.id, `mat_${index + 1}`),
    title: asString(item.title),
    category: asString(item.cat ?? item.category, MATERIAL_CATEGORIES[0]),
    description: asString(item.desc ?? item.description),
    durationMinutes: asNumber(item.time ?? item.durationMinutes, 10),
    objectives: asStringArray(item.objectives),
    body: normalizeBody(asString(item.body)),
    sample: item.sample === true,
    updatedAt: asNumber(item.updated ?? item.updatedAt, now()),
  }));
}

export function normalizeScripts(items: Legacy[] = []): Script[] {
  return items.filter(Boolean).map((item, index) => ({
    id: asString(item.id, `scr_seed${index}`),
    title: asString(item.title),
    category: asString(item.cat ?? item.category, SCRIPT_CATEGORIES[0]),
    situation: asString(item.situation),
    response: asString(item.response ?? item.text),
    variants: asStringArray(item.vars ?? item.variants),
    notes: asString(item.notes),
    tags: asStringArray(item.tags),
    sample: item.sample === true,
    updatedAt: asNumber(item.updated ?? item.updatedAt, now()),
  }));
}

export function normalizeCases(items: Legacy[] = []): CaseStudy[] {
  return items.filter(Boolean).map((item, index) => {
    const mark = CASE_MARKS.includes(item.mark) ? item.mark : 'Materi Pembelajaran';
    const chat = Array.isArray(item.chat)
      ? item.chat
          .map((message: unknown) =>
            Array.isArray(message)
              ? `${message[0] === 'a' ? 'A: ' : ''}${asString(message[1])}`
              : asString(message),
          )
          .join('\n')
      : '';
    return {
      id: asString(item.id, `case_seed${index}`),
      title: asString(item.title),
      category: asString(item.cat ?? item.category, SCRIPT_CATEGORIES[0]),
      mark,
      situation: asString(item.situation ?? item.situ),
      customerMessage: asString(item.customerMsg ?? item.customerMessage, chat),
      adminPrevious: asString(item.adminPrev ?? item.adminPrevious ?? item.wrong),
      finding: asString(item.finding ?? item.why),
      cause: asString(item.cause),
      recommendation: asString(item.recommendation ?? item.best),
      lesson: asString(item.lesson, Array.isArray(item.steps) ? item.steps.join('; ') : ''),
      anonymized: item.anon === false ? false : asBoolean(item.anonymized, true),
      sample: item.sample === true,
      updatedAt: asNumber(item.updated ?? item.updatedAt, now()),
    };
  });
}

export function normalizeBeforeAfter(items: Legacy[] = []): BeforeAfter[] {
  return items.filter(Boolean).map((item, index) => ({
    id: asString(item.id, `ba_seed${index}`),
    title: asString(item.title, 'Contoh'),
    category: asString(item.cat ?? item.category, SCRIPT_CATEGORIES[0]),
    before: asString(item.before),
    after: asString(item.after),
    why: asString(item.why),
    notes: asString(item.notes),
    sample: item.sample === true,
    updatedAt: asNumber(item.updated ?? item.updatedAt, now()),
  }));
}

export function normalizeFlow(items: Legacy[] = []): FlowStage[] {
  return items
    .filter(Boolean)
    .map((item, index) => ({
      id: asString(item.id, `flow_${index + 1}`),
      no: asNumber(item.no, index + 1),
      title: asString(item.title),
      description: asString(item.desc ?? item.description),
      goal: asString(item.goal),
      whenToUse: asString(item.when ?? item.whenToUse),
      info: asStringArray(item.info),
      steps: asStringArray(item.steps),
      example: asString(item.example),
      avoid: asStringArray(item.avoid),
      nextStep: asString(item.next ?? item.nextStep),
      scriptCategories: asStringArray(item.scriptCats ?? item.scriptCategories),
      problemIds: asStringArray(item.problems ?? item.problemIds),
      special: item.special === true,
      sample: item.sample === true,
      updatedAt: asNumber(item.updated ?? item.updatedAt, now()),
    }))
    .sort((a, b) => a.no - b.no);
}

export function normalizeGuides(items: Legacy[] = []): GuideSection[] {
  return items
    .filter(Boolean)
    .map((item, index) => ({
      id: asString(item.id, `gd_${index + 1}`),
      no: asNumber(item.no, index + 1),
      title: asString(item.title),
      summary: asString(item.summary),
      points: asStringArray(item.points),
      dos: asStringArray(item.dos),
      donts: asStringArray(item.donts),
      pairs: asStringArray(item.pairs),
      example: asString(item.example),
      takeaway: asString(item.takeaway),
      kind: (item.kind === 'ba' ? 'ba' : '') as GuideSection['kind'],
      sample: item.sample === true,
      updatedAt: asNumber(item.updated ?? item.updatedAt, now()),
    }))
    .sort((a, b) => a.no - b.no);
}

export function normalizeProblems(items: Legacy[] = []): Problem[] {
  return items.filter(Boolean).map((item, index) => {
    const severity: Severity = ['Rendah', 'Sedang', 'Tinggi'].includes(item.severity)
      ? item.severity
      : 'Sedang';
    return {
      id: asString(item.id, `prb_${index}`),
      title: asString(item.title),
      group: asString(item.group),
      severity,
      situation: asString(item.situation),
      concern: asString(item.concern),
      understand: asString(item.understand),
      collect: asStringArray(item.collect),
      process: asStringArray(item.process),
      checks: asStringArray(item.check ?? item.checks),
      example: asString(item.example),
      avoid: asStringArray(item.avoid),
      escalation: asString(item.escalation),
      sop: asString(item.sop),
      scriptCategories: asStringArray(item.scriptCats ?? item.scriptCategories),
      sample: item.sample === true,
      updatedAt: asNumber(item.updated ?? item.updatedAt, now()),
    };
  });
}

export function normalizeScenarios(items: Legacy[] = []): Scenario[] {
  return items.filter(Boolean).map((item, index) => ({
    id: asString(item.id, `scn_${index}`),
    title: asString(item.title ?? item.t),
    category: asString(item.cat ?? item.category, SCRIPT_CATEGORIES[0]),
    level: ['Mudah', 'Sedang', 'Sulit'].includes(item.lvl ?? item.level)
      ? (item.lvl ?? item.level)
      : 'Mudah',
    situation: asString(item.situation),
    objective: asString(item.objective),
    messages: asStringArray(item.msgs ?? item.messages),
    materialId: asString(item.material ?? item.materialId),
    sample: item.sample === true,
    updatedAt: asNumber(item.updated ?? item.updatedAt, now()),
  }));
}

export function normalizeQuiz(items: Legacy[] = []): QuizQuestion[] {
  return items.filter(Boolean).map((item, index) => {
    const options = asStringArray(item.options ?? item.o);
    const correct = asNumber(item.correct, asNumber(item.c, 0) + 1);
    return {
      id: asString(item.id, `q_seed${index}`),
      type: asString(item.type, 'Multiple choice'),
      category: asString(item.cat ?? item.category, MATERIAL_CATEGORIES[0]),
      question: asString(item.q ?? item.question),
      options,
      correct,
      explanation: asString(item.ex ?? item.explanation),
      sample: item.sample === true,
      updatedAt: asNumber(item.updated ?? item.updatedAt, now()),
    };
  });
}

export function normalizeProducts(items: Legacy[] = []): Product[] {
  return items.filter(Boolean).map((item, index) => {
    const category: ProductCategory = PRODUCT_CATEGORIES.includes(item.cat ?? item.category)
      ? (item.cat ?? item.category)
      : 'Thobe';
    return {
      id: asString(item.id, `p_seed${index}`),
      category,
      name: asString(item.name),
      code: asString(item.code),
      series: asString(item.series),
      status: asString(item.status),
      description: asString(item.desc ?? item.description),
      fabric: asString(item.fabric),
      colors: asString(item.colors),
      sizes: asString(item.sizes),
      price: asNumberString(item.price),
      advantages: asString(item.adv ?? item.advantages),
      extra: asString(item.extra),
      composition: asString(item.composition),
      gsm: asNumberString(item.gsm),
      characteristics: asString(item.character ?? item.characteristics),
      table: asString(item.table),
      measurement: asString(item.measure ?? item.measurement),
      guide: asString(item.guide),
      memberIds: asStringArray(item.members ?? item.memberIds),
      sample: item.sample === true,
      updatedAt: asNumber(item.updated ?? item.updatedAt, now()),
    };
  });
}

export function normalizeActivity(items: unknown): ActivityItem[] {
  if (!Array.isArray(items)) return [];
  return items.filter(Boolean).map((item: Legacy, index: number) => {
    const type = ['scenario', 'review', 'material', 'assessment'].includes(item.type)
      ? item.type
      : 'scenario';
    return {
      id: asString(item.id, `h_seed${index}`),
      type,
      title: asString(item.title),
      score: item.score == null || Number.isNaN(Number(item.score)) ? null : Number(item.score),
      refId: asString(item.ref ?? item.refId),
      createdAt: asNumber(item.at ?? item.createdAt, now()),
      sample: item.sample === true,
    };
  });
}

export function normalizeAttempts(items: unknown): AssessmentAttempt[] {
  if (!Array.isArray(items)) return [];
  return items.filter(Boolean).map((item: Legacy, index: number) => ({
    id: asString(item.id, `att_${index}`),
    createdAt: asNumber(item.at ?? item.createdAt, now()),
    score: asNumber(item.score),
    correct: asNumber(item.correct),
    total: asNumber(item.total),
    pass: item.pass === true,
    passMark: asNumber(item.passMark, DEFAULT_PASS_MARK),
    wrong: Array.isArray(item.wrong)
      ? item.wrong.map((wrong: Legacy) => ({
          questionId: asString(wrong.qid ?? wrong.questionId),
          category: asString(wrong.cat ?? wrong.category),
        }))
      : [],
    answers:
      item.answers && typeof item.answers === 'object'
        ? Object.fromEntries(
            Object.entries(item.answers as Record<string, unknown>).map(([key, value]) => [
              key,
              asNumber(value),
            ]),
          )
        : {},
  }));
}

export function normalizeSettings(value: unknown): AssessmentSettings {
  const legacy = (value && typeof value === 'object' ? value : {}) as Legacy;
  return { passMark: asNumber(legacy.passMark ?? legacy.pass, DEFAULT_PASS_MARK) };
}

export function normalizeProgress(value: unknown): ProgressState {
  const legacy = (value && typeof value === 'object' ? value : {}) as Legacy;
  const materials: Record<string, { status: MaterialStatus; progress: number; updatedAt: number }> = {};
  Object.entries(legacy.mat ?? legacy.materials ?? {}).forEach(([key, raw]) => {
    const item = raw as Legacy;
    const status: MaterialStatus = ['todo', 'progress', 'done'].includes(item?.status)
      ? item.status
      : 'todo';
    materials[key] = {
      status,
      progress: asNumber(item?.progress, status === 'done' ? 100 : 0),
      updatedAt: asNumber(item?.at ?? item?.updatedAt, now()),
    };
  });
  const flagMap = (input: unknown): Record<string, boolean> => {
    const result: Record<string, boolean> = {};
    if (input && typeof input === 'object') {
      Object.entries(input as Record<string, unknown>).forEach(([key, flag]) => {
        if (flag) result[key] = true;
      });
    }
    return result;
  };
  return {
    materials,
    guides: flagMap(legacy.guide ?? legacy.guides),
    problems: flagMap(legacy.prob ?? legacy.problems),
    flow: flagMap(legacy.flow),
    visitedProducts: Boolean(legacy.visitedProducts),
  };
}

export interface LegacyContentInput {
  materials?: Legacy[];
  scripts?: Legacy[];
  cases?: Legacy[];
  beforeAfter?: Legacy[];
  flow?: Legacy[];
  guides?: Legacy[];
  problems?: Legacy[];
  scenarios?: Legacy[];
  quiz?: Legacy[];
  products?: Legacy[];
}

export function normalizeContent(input: LegacyContentInput): ContentCollections {
  return {
    materials: normalizeMaterials(input.materials),
    scripts: normalizeScripts(input.scripts),
    cases: normalizeCases(input.cases),
    beforeAfter: normalizeBeforeAfter(input.beforeAfter),
    flow: normalizeFlow(input.flow),
    guides: normalizeGuides(input.guides),
    problems: normalizeProblems(input.problems),
    scenarios: normalizeScenarios(input.scenarios),
    quiz: normalizeQuiz(input.quiz),
    products: normalizeProducts(input.products),
  };
}

export function buildSnapshot(
  content: ContentCollections,
  options: { activity?: Legacy[]; attempts?: Legacy[]; settings?: Legacy; progress?: Legacy } = {},
): AcademySnapshot {
  return {
    content,
    progress: normalizeProgress(options.progress),
    activity: normalizeActivity(options.activity),
    attempts: normalizeAttempts(options.attempts),
    settings: normalizeSettings(options.settings),
  };
}
