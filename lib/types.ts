export type Role = 'owner' | 'cs';
export type MaterialStatus = 'todo' | 'progress' | 'done';
export type CaseMark = 'Perlu Perbaikan' | 'Contoh Praktik Baik' | 'Materi Pembelajaran';
export type Severity = 'Rendah' | 'Sedang' | 'Tinggi';
export type ScenarioLevel = 'Mudah' | 'Sedang' | 'Sulit';
export type ProductCategory =
  | 'Thobe'
  | 'Gamis'
  | 'Koko'
  | 'Fabric Collection'
  | 'Size Chart'
  | 'Product Series';
export type ActivityType = 'scenario' | 'review' | 'material' | 'assessment';

export interface BaseContent {
  id: string;
  sample?: boolean;
  updatedAt?: number;
}

export interface Material extends BaseContent {
  title: string;
  category: string;
  description: string;
  durationMinutes: number;
  objectives: string[];
  body: string;
  videoUrl?: string;
  /** Urutan belajar (kolom content_items.sort_order). */
  sortOrder?: number;
  /** Durasi video YouTube, mis. "8:12" — opsional, hanya untuk badge. */
  videoDuration?: string;
  /** Kredit penyusun materi (nama/kontributor) — opsional, tampil di kartu dan detail. */
  contributor?: string;
  /** Level belajar (kolom content_items.level_id) — null bila belum ditempatkan. */
  levelId?: number | null;
  /** Materi wajib (kolom content_items.is_required) — memengaruhi progres dan kunci level. */
  isRequired?: boolean;
}

/** Satu level jalur belajar (tabel learning_levels). */
export interface LearningLevel {
  id: number;
  title: string;
  description: string;
  sortOrder: number;
}

/** Soal kuis milik satu materi (tabel quiz_questions). */
export interface MaterialQuizQuestion {
  id: string;
  materialId: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sortOrder: number;
}

/** Percobaan kuis materi milik satu user (tabel quiz_attempts). */
export interface QuizAttempt {
  id: string;
  materialId: string;
  score: number;
  answers: Record<string, number>;
  createdAt: number;
}

export interface Script extends BaseContent {
  title: string;
  category: string;
  situation: string;
  response: string;
  variants: string[];
  notes: string;
  tags: string[];
}

export interface CaseStudy extends BaseContent {
  title: string;
  category: string;
  mark: CaseMark;
  situation: string;
  customerMessage: string;
  adminPrevious: string;
  finding: string;
  cause: string;
  recommendation: string;
  lesson: string;
  anonymized: boolean;
}

export interface BeforeAfter extends BaseContent {
  title: string;
  category: string;
  mark?: CaseMark;
  before: string;
  after: string;
  why: string;
  notes: string;
  mistakeToAvoid?: string;
  principles?: string[];
}

export interface FlowStage extends BaseContent {
  no: number;
  title: string;
  description: string;
  goal: string;
  whenToUse: string;
  info: string[];
  steps: string[];
  example: string;
  avoid: string[];
  nextStep: string;
  scriptCategories: string[];
  problemIds: string[];
  special?: boolean;
}

export interface GuideSection extends BaseContent {
  no: number;
  title: string;
  summary: string;
  points?: string[] | null;
  dos?: string[] | null;
  donts?: string[] | null;
  pairs?: string[] | null;
  example?: string | null;
  takeaway?: string | null;
  kind?: 'ba' | '';
}

export interface Problem extends BaseContent {
  title: string;
  group: string;
  severity: Severity;
  situation: string;
  concern: string;
  understand: string;
  collect: string[];
  process: string[];
  checks: string[];
  example: string;
  avoid: string[];
  escalation: string;
  sop: string;
  scriptCategories: string[];
}

export interface Scenario extends BaseContent {
  title: string;
  category: string;
  level: ScenarioLevel;
  situation: string;
  objective: string;
  messages: string[];
  materialId: string;
}

export interface QuizQuestion extends BaseContent {
  type: string;
  category: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

export interface Product extends BaseContent {
  category: ProductCategory;
  name: string;
  code: string;
  series: string;
  status: string;
  description: string;
  fabric: string;
  colors: string;
  sizes: string;
  price: string;
  advantages: string;
  extra: string;
  composition: string;
  gsm: string;
  characteristics: string;
  table: string;
  measurement: string;
  guide: string;
  memberIds: string[];
  collar?: string;
  placket?: string;
  customerPitch?: string;
  image?: string;
  /** Link video YouTube per seri; kosong = modal memakai foto close-up. */
  videoUrl?: string;
}

export interface ContentCollections {
  materials: Material[];
  scripts: Script[];
  cases: CaseStudy[];
  beforeAfter: BeforeAfter[];
  flow: FlowStage[];
  guides: GuideSection[];
  problems: Problem[];
  scenarios: Scenario[];
  quiz: QuizQuestion[];
  products: Product[];
}

export interface MaterialProgress {
  status: MaterialStatus;
  progress: number;
  updatedAt: number;
}

export interface ProgressState {
  materials: Record<string, MaterialProgress>;
  guides: Record<string, boolean>;
  problems: Record<string, boolean>;
  flow: Record<string, boolean>;
  visitedProducts: boolean;
}

export interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  score: number | null;
  refId: string;
  createdAt: number;
  sample?: boolean;
}

export interface AssessmentAttempt {
  id: string;
  createdAt: number;
  score: number;
  correct: number;
  total: number;
  pass: boolean;
  passMark: number;
  wrong: { questionId: string; category: string }[];
  answers: Record<string, number>;
}

export interface AssessmentSettings {
  passMark: number;
}

export interface AcademySnapshot {
  content: ContentCollections;
  /** Jalur belajar: level dari tabel learning_levels. */
  levels: LearningLevel[];
  /** Soal kuis per material_id. */
  materialQuizzes: Record<string, MaterialQuizQuestion[]>;
  /** Percobaan kuis user (terbaru lebih dulu). */
  quizAttempts: QuizAttempt[];
  progress: ProgressState;
  activity: ActivityItem[];
  attempts: AssessmentAttempt[];
  settings: AssessmentSettings;
}

export type ContentCollectionKey = keyof ContentCollections;

export type CollectionItem<K extends ContentCollectionKey> = ContentCollections[K][number];

export interface QuizRuntime {
  ids: string[];
  index: number;
  answers: Record<string, number>;
  done: boolean;
  attemptId?: string;
  attempt?: AssessmentAttempt;
}

export interface SimulatorRuntime {
  scenarioId: string;
  turn: number;
  log: [('c' | 'a'), string][];
  ended: boolean;
  busy: boolean;
  done: boolean;
  result?: import('./ai/types').ReviewResult;
}

export interface ReviewMessage {
  role: 'c' | 'a';
  text: string;
}

export interface ReviewRuntime {
  messages: ReviewMessage[];
  result?: import('./ai/types').ReviewResult;
  analyzing: boolean;
}

export interface AssistantEntry {
  role: 'user' | 'assistant';
  question?: string;
  answer?: import('./ai/types').AssistantAnswer;
  text?: string;
  sources?: import('./ai/types').AssistantSource[];
  provider?: string;
  model?: string;
  fallback?: boolean;
  note?: string;
}
