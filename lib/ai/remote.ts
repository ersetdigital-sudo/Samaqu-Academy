import { getSupabaseClient } from '@/lib/supabase/client';
import type { AssistantSource, ReviewResult } from './types';

export interface AiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface AssistantRemoteMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: AssistantSource[];
  provider?: string | null;
  model?: string | null;
  createdAt: string;
}

export interface AssistantRemoteResult {
  conversationId: string;
  model: string;
  sources: AssistantSource[];
  userMessage: AssistantRemoteMessage;
  message: AssistantRemoteMessage;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ReviewerRemoteResult {
  model: string;
  result: ReviewResult;
}

export interface SimulatorRemoteResult {
  done: boolean;
  message: string | null;
  model: string;
}

async function readFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string; message?: string };
      const message = body?.error ?? body?.message;
      if (message) return message;
    } catch {
      // The body may already be consumed; fall back to the SDK message.
    }
  }
  if (error instanceof Error && error.message) {
    if (
      /Failed to send a request|Failed to fetch|NetworkError|FunctionsFetchError|FunctionsRelayError/i.test(
        error.message,
      )
    ) {
      return 'Layanan AI server belum dapat dihubungi. Pastikan Edge Function sudah di-deploy dan konfigurasi Supabase benar.';
    }
    return error.message;
  }
  return 'Tidak dapat menghubungi layanan AI. Coba lagi.';
}

async function invoke<T>(
  fn: 'ai' | 'ai-admin',
  action: string,
  payload: Record<string, unknown>,
): Promise<AiEnvelope<T>> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      ok: false,
      code: 'not_configured',
      error: 'Supabase belum dikonfigurasi di browser.',
    };
  }

  const { data, error } = await client.functions.invoke(fn, {
    body: { action, ...payload },
  });

  if (error) {
    return { ok: false, code: 'network_error', error: await readFunctionError(error) };
  }

  const body = data as { ok?: boolean; error?: string; code?: string } | null;
  if (!body || body.ok === false) {
    return {
      ok: false,
      code: body?.code ?? 'request_error',
      error: body?.error ?? 'Permintaan AI gagal diproses.',
    };
  }

  return { ok: true, data: data as T };
}

export function invokeAi<T>(
  action: 'assistant' | 'reviewer' | 'simulator',
  payload: Record<string, unknown>,
): Promise<AiEnvelope<T>> {
  return invoke<T>('ai', action, payload);
}

export function invokeAiAdmin<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<AiEnvelope<T>> {
  return invoke<T>('ai-admin', action, payload);
}
