export type AiPlan = 'payg' | 'token_plan' | 'custom';
export type ResponseLength = 'pendek' | 'sedang' | 'panjang';

export interface AiBehavior {
  assistantName: string;
  character: string;
  systemInstructions: string;
  language: string;
  responseLength: ResponseLength;
  temperature: number;
  maxTokens: number;
  knowledgeRules: string;
  memoryRules: string;
}

export interface AiPricing {
  inputPer1M?: number;
  outputPer1M?: number;
  currency?: string;
}

export interface AiSettings {
  provider: string;
  plan: AiPlan;
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  defaultModel: string;
  featureModels: Record<string, string>;
  behavior: AiBehavior;
  pricing: AiPricing;
  updatedAt: string | null;
}

export type ProviderProfileId = 'xiaomi' | 'commandcode' | 'custom';

export interface ProviderProfile {
  id: ProviderProfileId;
  label: string;
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  defaultModel: string;
  featureModels: Record<string, string>;
  pricing: AiPricing;
  isActive: boolean;
  lastActiveAt: string | null;
}

export interface ProfileModelInfo {
  id: string;
  ownedBy: string;
  /** false = provider tidak melayani /chat/completions (mis. model Claude di Command Code). */
  chat: boolean;
}

export interface AiSettingsPayload {
  settings: AiSettings;
  defaults: AiBehavior;
  encryptionReady: boolean;
  /** Pesan dari server setelah aksi (mis. "Tersimpan dan langsung berlaku"). */
  message?: string;
  /** false/kosong = migrasi profil belum diterapkan; halaman memakai tampilan lama. */
  profilesReady?: boolean;
  profiles?: ProviderProfile[];
  activeProfileId?: ProviderProfileId | null;
  previousProfileId?: ProviderProfileId | null;
}

export interface MimoModel {
  id: string;
  ownedBy: string;
}

export interface AiUsageLog {
  id: string;
  user_email: string | null;
  feature: 'assistant' | 'reviewer' | 'simulator' | 'admin_test' | 'admin_models';
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  status: 'success' | 'error';
  error: string | null;
  latency_ms: number | null;
  estimated_cost: number | null;
  created_at: string;
}

export const AI_FEATURE_LABELS: Record<AiUsageLog['feature'], string> = {
  assistant: 'Knowledge Assistant',
  reviewer: 'Chat Reviewer',
  simulator: 'Chat Simulator',
  admin_test: 'Tes Admin',
  admin_models: 'Daftar Model',
};

export const PLAN_LABELS: Record<AiPlan, string> = {
  payg: 'API Pay-as-you-go',
  token_plan: 'Token Plan',
  custom: 'Base URL khusus',
};

export const FEATURE_MODEL_LABELS: Record<string, string> = {
  assistant: 'AI Knowledge Assistant',
  reviewer: 'AI Chat Reviewer',
  simulator: 'AI Chat Simulator',
};

export const PROFILE_PRESETS: Record<
  ProviderProfileId,
  { baseUrl: string; urlHint: string; keyHint: string; modelHint: string; modelHints: string[] }
> = {
  xiaomi: {
    baseUrl: 'https://api.xiaomimimo.com/v1',
    urlHint: 'Default: https://api.xiaomimimo.com/v1',
    keyHint: 'Kunci dari konsol Xiaomi MiMo. Saldo dan kuota mengikuti akun Xiaomi.',
    modelHint: 'Xiaomi langsung memakai nama tanpa awalan, mis. mimo-v2.6-pro.',
    modelHints: ['mimo-v2.6-pro', 'mimo-v2.6-flash'],
  },
  commandcode: {
    baseUrl: 'https://api.commandcode.ai/provider/v1',
    urlHint: 'Default: https://api.commandcode.ai/provider/v1',
    keyHint: 'Kunci dari Studio Command Code > API keys. Paket Pro punya jatah bulanan per model.',
    modelHint:
      'Command Code memakai id berawalan penyedia, mis. xiaomi/mimo-v2.6-flash. Nama tanpa awalan ditolak.',
    modelHints: ['xiaomi/mimo-v2.6-flash', 'xiaomi/mimo-v2.6-pro'],
  },
  custom: {
    baseUrl: '',
    urlHint: 'Alamat API kompatibel OpenAI (wajib https), biasanya berakhiran /v1.',
    keyHint: 'Kunci dari penyedia pilihanmu.',
    modelHint: 'Isi id model persis seperti di dokumentasi penyedia.',
    modelHints: [],
  },
};
