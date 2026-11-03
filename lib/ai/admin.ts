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

export interface AiSettingsPayload {
  settings: AiSettings;
  defaults: AiBehavior;
  encryptionReady: boolean;
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
