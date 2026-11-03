import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { decryptSecret } from './crypto.ts';
import { mergeBehavior, type AiBehavior } from './prompts.ts';

export type AiFeature = 'assistant' | 'reviewer' | 'simulator';
export type UsageFeature = AiFeature | 'admin_test' | 'admin_models';

export interface AiPricing {
  inputPer1M?: number;
  outputPer1M?: number;
  currency?: string;
}

export interface AiSettingsRow {
  provider: string;
  plan: 'payg' | 'token_plan' | 'custom';
  base_url: string;
  api_key_ciphertext: string | null;
  api_key_iv: string | null;
  api_key_last4: string | null;
  default_model: string;
  feature_models: Record<string, string> | null;
  behavior: Record<string, unknown> | null;
  pricing: AiPricing | null;
  updated_at: string | null;
}

export interface PublicAiSettings {
  provider: string;
  plan: AiSettingsRow['plan'];
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  defaultModel: string;
  featureModels: Record<string, string>;
  behavior: AiBehavior;
  pricing: AiPricing;
  updatedAt: string | null;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export class AiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const FEATURE_LIMITS: Record<UsageFeature, number> = {
  assistant: 12,
  reviewer: 8,
  simulator: 20,
  admin_test: 10,
  admin_models: 6,
};

export async function loadSettings(service: SupabaseClient): Promise<AiSettingsRow> {
  const { data, error } = await service
    .from('ai_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new AiError('Gagal membaca pengaturan AI dari database.', 500);
  if (!data) throw new AiError('Pengaturan AI belum tersedia di database.', 500);
  return data as AiSettingsRow;
}

export async function apiKeyFor(row: AiSettingsRow): Promise<string | null> {
  if (!row.api_key_ciphertext || !row.api_key_iv) return null;
  try {
    return await decryptSecret(row.api_key_ciphertext, row.api_key_iv);
  } catch {
    throw new AiError(
      'API Key tersimpan tidak dapat dibuka. Simpan ulang API Key melalui menu Admin.',
      500,
    );
  }
}

export function publicSettings(row: AiSettingsRow): PublicAiSettings {
  return {
    provider: row.provider,
    plan: row.plan,
    baseUrl: row.base_url,
    hasApiKey: Boolean(row.api_key_ciphertext),
    apiKeyLast4: row.api_key_last4,
    defaultModel: row.default_model,
    featureModels: row.feature_models ?? {},
    behavior: mergeBehavior(row.behavior),
    pricing: row.pricing ?? {},
    updatedAt: row.updated_at,
  };
}

export function resolveModel(row: AiSettingsRow, feature: AiFeature): string {
  const specific = row.feature_models?.[feature];
  return (specific && String(specific).trim()) || row.default_model;
}

export function estimateCost(usage: TokenUsage, pricing: AiPricing | null): number | null {
  const input = Number(pricing?.inputPer1M);
  const output = Number(pricing?.outputPer1M);
  if (!Number.isFinite(input) && !Number.isFinite(output)) return null;
  const value =
    (usage.promptTokens / 1_000_000) * (Number.isFinite(input) ? input : 0) +
    (usage.completionTokens / 1_000_000) * (Number.isFinite(output) ? output : 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 1_000_000) / 1_000_000;
}

export async function enforceRateLimit(
  service: SupabaseClient,
  userId: string,
  feature: UsageFeature,
): Promise<void> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await service
    .from('ai_usage_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('feature', feature)
    .gte('created_at', since);
  if (error) return;
  if ((count ?? 0) >= FEATURE_LIMITS[feature]) {
    throw new AiError(
      'Terlalu banyak permintaan dalam satu menit. Tunggu sebentar lalu coba lagi.',
      200,
    );
  }
}

interface UsageEntry {
  userId: string;
  userEmail: string | null;
  feature: UsageFeature;
  model: string | null;
  usage?: TokenUsage | null;
  status: 'success' | 'error';
  error?: string | null;
  latencyMs: number;
  estimatedCost?: number | null;
}

export async function logUsage(
  service: SupabaseClient,
  entry: UsageEntry,
): Promise<void> {
  try {
    await service.from('ai_usage_logs').insert({
      id: `use_${crypto.randomUUID()}`,
      user_id: entry.userId,
      user_email: entry.userEmail,
      feature: entry.feature,
      model: entry.model,
      prompt_tokens: entry.usage?.promptTokens ?? null,
      completion_tokens: entry.usage?.completionTokens ?? null,
      total_tokens: entry.usage?.totalTokens ?? null,
      status: entry.status,
      error: entry.error ? entry.error.slice(0, 500) : null,
      latency_ms: entry.latencyMs,
      estimated_cost: entry.estimatedCost ?? null,
    });
  } catch {
    // Usage logging must never break the AI response.
  }
}
