import type { TokenUsage } from './settings.ts';

const CHAT_TIMEOUT_MS = 45_000;
const MODELS_TIMEOUT_MS = 20_000;

export interface MimoMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type ThinkingMode = 'enabled' | 'disabled';

export interface MimoChatOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: MimoMessage[];
  temperature?: number;
  maxTokens?: number;
  thinking?: ThinkingMode;
  timeoutMs?: number;
}

export interface MimoChatResult {
  content: string;
  reasoningContent: string | null;
  finishReason: string | null;
  usage: TokenUsage;
  model: string;
}

export function normalizeBaseUrl(value: string): string {
  const trimmed = String(value ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return 'https://api.xiaomimimo.com/v1';
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Base URL tidak valid.');
  }
  if (url.protocol !== 'https:') throw new Error('Base URL harus menggunakan https://');
  if (!url.pathname || url.pathname === '/') {
    url.pathname = '/v1';
  }
  return url.toString().replace(/\/+$/, '');
}

async function request(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Provider AI tidak merespons tepat waktu. Coba lagi.');
    }
    throw new Error('Tidak dapat menghubungi provider AI. Periksa koneksi server.');
  } finally {
    clearTimeout(timer);
  }
}

async function providerError(response: Response): Promise<string> {
  let detail = '';
  try {
    const data = await response.json();
    detail =
      String(
        data?.error?.message ??
          data?.error ??
          data?.message ??
          '',
      ).trim();
  } catch {
    // ignore non-JSON error body
  }
  if (response.status === 401 || response.status === 403) {
    return 'API Key ditolak provider. Periksa kembali API Key di menu Pengaturan AI.';
  }
  if (response.status === 429) {
    return 'Kuota atau rate limit provider tercapai. Coba lagi beberapa saat.';
  }
  if (response.status >= 500) {
    return 'Provider AI sedang bermasalah. Coba lagi beberapa saat.';
  }
  return detail
    ? `Provider AI menolak permintaan (${response.status}): ${detail.slice(0, 240)}`
    : `Provider AI menolak permintaan (${response.status}).`;
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const value = part as Record<string, unknown>;
          return typeof value.text === 'string' ? value.text : '';
        }
        return '';
      })
      .join('');
  }
  return '';
}

function usageFrom(raw: unknown): TokenUsage {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const prompt = Number(value.prompt_tokens ?? 0);
  const completion = Number(value.completion_tokens ?? 0);
  const total = Number(value.total_tokens ?? prompt + completion);
  // MiMo membedakan cache hit / cache miss (prompt_tokens_details.cached_tokens).
  const details = value.prompt_tokens_details && typeof value.prompt_tokens_details === 'object'
    ? (value.prompt_tokens_details as Record<string, unknown>)
    : {};
  const cached = Number(details.cached_tokens ?? value.cache_read_input_tokens ?? value.cached_tokens ?? 0);
  return {
    promptTokens: Number.isFinite(prompt) ? prompt : 0,
    completionTokens: Number.isFinite(completion) ? completion : 0,
    totalTokens: Number.isFinite(total) ? total : 0,
    cachedTokens: Number.isFinite(cached) ? cached : 0,
  };
}

export async function mimoChat(options: MimoChatOptions): Promise<MimoChatResult> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const response = await request(
    `${baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        // MiMo accepts either header; OpenAI-compatible clients use Bearer.
        Authorization: `Bearer ${options.apiKey}`,
        'api-key': options.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.4,
        max_completion_tokens: options.maxTokens ?? 900,
        thinking: { type: options.thinking ?? 'disabled' },
        stream: false,
      }),
    },
    options.timeoutMs ?? CHAT_TIMEOUT_MS,
  );

  if (!response.ok) throw new Error(await providerError(response));

  const data = await response.json();
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  const content = contentText(choice?.message?.content ?? choice?.text ?? '').trim();
  const rawReasoning = choice?.message?.reasoning_content;
  const reasoningContent =
    typeof rawReasoning === 'string' && rawReasoning.trim() ? rawReasoning.trim() : null;
  const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : null;
  const usage = usageFrom(data?.usage);

  if (!content) {
    if (finishReason === 'length') {
      throw new Error(
        'Jawaban AI terpotong karena mencapai batas token. Naikkan batas token atau pendekkan pertanyaan.',
      );
    }
    throw new Error('Provider AI mengembalikan jawaban kosong.');
  }

  return {
    content,
    reasoningContent,
    finishReason,
    usage,
    model: String(data?.model ?? options.model),
  };
}

export interface MimoModel {
  id: string;
  ownedBy: string;
}

export async function mimoModels(options: {
  apiKey: string;
  baseUrl: string;
}): Promise<MimoModel[]> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const response = await request(
    `${baseUrl}/models`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'api-key': options.apiKey,
      },
    },
    MODELS_TIMEOUT_MS,
  );

  if (!response.ok) throw new Error(await providerError(response));

  const data = await response.json();
  const rows = Array.isArray(data?.data) ? data.data : [];
  const models = rows
    .map((item: unknown) => {
      if (!item || typeof item !== 'object') return null;
      const value = item as Record<string, unknown>;
      const id = String(value.id ?? '').trim();
      if (!id) return null;
      return { id, ownedBy: String(value.owned_by ?? 'xiaomi-mimo') };
    })
    .filter(Boolean) as MimoModel[];

  return models.sort((a, b) => a.id.localeCompare(b.id));
}
