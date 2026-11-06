import { normalizeBaseUrl, type ThinkingMode } from './mimo.ts';
import type { TokenUsage } from './settings.ts';

export interface MimoToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface MimoToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: MimoToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface MimoToolChatOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: ToolChatMessage[];
  tools: MimoToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  thinking?: ThinkingMode;
  timeoutMs?: number;
}

export interface MimoToolChatResult {
  content: string;
  toolCalls: MimoToolCall[];
  finishReason: string | null;
  usage: TokenUsage;
  model: string;
}

const CHAT_TIMEOUT_MS = 45_000;

function usageFrom(raw: unknown): TokenUsage {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const prompt = Number(value.prompt_tokens ?? 0);
  const completion = Number(value.completion_tokens ?? 0);
  const total = Number(value.total_tokens ?? prompt + completion);
  return {
    promptTokens: Number.isFinite(prompt) ? prompt : 0,
    completionTokens: Number.isFinite(completion) ? completion : 0,
    totalTokens: Number.isFinite(total) ? total : 0,
  };
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

/**
 * Satu panggilan MiMo non-streaming yang mendukung function calling.
 * Dipakai bot WhatsApp server: model boleh memanggil tool SAMAQU (harga, stok,
 * ongkir, pesanan, lead) sebelum menyusun balasan.
 */
export async function mimoChatWithTools(options: MimoToolChatOptions): Promise<MimoToolChatResult> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? CHAT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'api-key': options.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        tools: options.tools,
        tool_choice: 'auto',
        temperature: options.temperature ?? 0.4,
        max_completion_tokens: options.maxTokens ?? 700,
        thinking: { type: options.thinking ?? 'disabled' },
        chat_template_kwargs: { enable_thinking: false },
        stream: false,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = String(data?.error?.message ?? data?.error ?? data?.message ?? '').slice(0, 240);
    } catch {
      // body bukan JSON
    }
    throw new Error(`Provider AI menolak permintaan (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  const data = await response.json();
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  const message = choice?.message ?? {};
  const rawCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];

  const toolCalls: MimoToolCall[] = rawCalls.map((call: unknown, index: number) => {
    const value = call && typeof call === 'object' ? (call as Record<string, unknown>) : {};
    const fn = value.function && typeof value.function === 'object'
      ? (value.function as Record<string, unknown>)
      : {};
    return {
      id: String(value.id ?? `call_${index}`),
      type: 'function' as const,
      function: {
        name: String(fn.name ?? ''),
        arguments: String(fn.arguments ?? '{}'),
      },
    };
  });

  return {
    content: contentText(message?.content ?? choice?.text ?? '').trim(),
    toolCalls,
    finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
    usage: usageFrom(data?.usage),
    model: String(data?.model ?? options.model),
  };
}
