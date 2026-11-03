import {
  CORS,
  errorMessage,
  json,
  requireUser,
  serviceClient,
} from '../_shared/http.ts';
import { buildAiContext } from '../_shared/knowledge.ts';
import { mimoChat } from '../_shared/mimo.ts';
import {
  buildAssistantSystemPrompt,
  buildReviewerSystemPrompt,
  buildSimulatorSystemPrompt,
  mergeBehavior,
  normalizeReviewResult,
  SIMULATOR_DONE,
} from '../_shared/prompts.ts';
import {
  AiError,
  apiKeyFor,
  enforceRateLimit,
  estimateCost,
  loadSettings,
  logUsage,
  resolveModel,
  resolveThinking,
  type AiSettingsRow,
} from '../_shared/settings.ts';

const NOT_CONFIGURED =
  'AI belum terhubung ke Xiaomi MiMo. Owner perlu menambahkan API Key di Pengaturan AI.';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ConversationRow {
  id: string;
  title: string;
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function notConfigured() {
  return json({ ok: false, code: 'not_configured', error: NOT_CONFIGURED });
}

function featureError(code: string, message: string) {
  return json({ ok: false, code, error: message });
}

async function conversationFor(
  service: ReturnType<typeof serviceClient>,
  userId: string,
  conversationId: string,
): Promise<ConversationRow | null> {
  const { data } = await service
    .from('ai_conversations')
    .select('id,title')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as ConversationRow | null) ?? null;
}

async function handleAssistant(
  service: ReturnType<typeof serviceClient>,
  user: { id: string; email?: string | null },
  body: Record<string, unknown>,
) {
  const question = String(body.question ?? '').trim().slice(0, 4000);
  if (!question) throw new AiError('Pertanyaan tidak boleh kosong.', 400);

  const row: AiSettingsRow = await loadSettings(service);
  const apiKey = await apiKeyFor(row);
  if (!apiKey) return notConfigured();

  await enforceRateLimit(service, user.id, 'assistant');

  let conversationId = String(body.conversationId ?? '').trim();
  let conversation: ConversationRow | null = null;
  if (conversationId) {
    conversation = await conversationFor(service, user.id, conversationId);
    if (!conversation) {
      return featureError('conversation_not_found', 'Percakapan tidak ditemukan.');
    }
  }

  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  if (conversationId) {
    const { data } = await service
      .from('ai_messages')
      .select('role,content')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    (data ?? [])
      .reverse()
      .forEach((message) => {
        const value = message as { role: string; content: string };
        if (value.role === 'user' || value.role === 'assistant') {
          history.push({
            role: value.role,
            content: String(value.content ?? '').slice(0, 2200),
          });
        }
      });
  }

  const behavior = mergeBehavior(row.behavior);
  const aiContext = await buildAiContext(service, {
    userId: user.id,
    question,
    conversationId: conversationId || null,
  });
  const systemPrompt = buildAssistantSystemPrompt(behavior, aiContext.context);
  const chatMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: question },
  ];

  const model = resolveModel(row, 'assistant');
  const started = Date.now();
  let result;
  try {
    result = await mimoChat({
      apiKey,
      baseUrl: row.base_url,
      model,
      messages: chatMessages,
      temperature: behavior.temperature,
      maxTokens: behavior.maxTokens,
      thinking: resolveThinking(row, 'assistant'),
    });
  } catch (error) {
    const message = errorMessage(error);
    await logUsage(service, {
      userId: user.id,
      userEmail: user.email ?? null,
      feature: 'assistant',
      model,
      status: 'error',
      error: message,
      latencyMs: Date.now() - started,
    });
    return featureError('upstream_error', message);
  }

  const now = new Date().toISOString();
  if (!conversation) {
    conversationId = newId('conv');
    const title =
      question.replace(/\s+/g, ' ').slice(0, 70) || 'Percakapan Baru';
    const { error } = await service.from('ai_conversations').insert({
      id: conversationId,
      user_id: user.id,
      title,
      created_at: now,
      updated_at: now,
    });
    if (error) throw new AiError('Gagal menyimpan percakapan baru.', 500);
  } else {
    conversationId = conversation.id;
    await service
      .from('ai_conversations')
      .update({ updated_at: now })
      .eq('id', conversationId)
      .eq('user_id', user.id);
  }

  const userMessageId = newId('msg');
  const assistantMessageId = newId('msg');
  const assistantAt = new Date(Date.parse(now) + 1).toISOString();
  const sources = aiContext.sources.map((source) => ({
    id: source.id,
    title: source.title,
    category: source.category,
    source: source.source,
    type: source.type,
    status: source.status,
    sample: source.sample,
    updatedAt: source.updatedAt,
  }));

  const { error: insertError } = await service.from('ai_messages').insert([
    {
      id: userMessageId,
      conversation_id: conversationId,
      user_id: user.id,
      role: 'user',
      content: question,
      sources: [],
      created_at: now,
    },
    {
      id: assistantMessageId,
      conversation_id: conversationId,
      user_id: user.id,
      role: 'assistant',
      content: result.content,
      sources,
      provider: 'mimo',
      model: result.model,
      created_at: assistantAt,
    },
  ]);
  if (insertError) throw new AiError('Jawaban diterima tetapi gagal disimpan.', 500);

  await logUsage(service, {
    userId: user.id,
    userEmail: user.email ?? null,
    feature: 'assistant',
    model: result.model,
    usage: result.usage,
    status: 'success',
    latencyMs: Date.now() - started,
    estimatedCost: estimateCost(result.usage, row.pricing),
  });

  return json({
    ok: true,
    conversationId,
    model: result.model,
    usage: result.usage,
    sources,
    userMessage: {
      id: userMessageId,
      role: 'user',
      content: question,
      sources: [],
      createdAt: now,
    },
    message: {
      id: assistantMessageId,
      role: 'assistant',
      content: result.content,
      sources,
      provider: 'mimo',
      model: result.model,
      createdAt: assistantAt,
    },
  });
}

async function handleReviewer(
  service: ReturnType<typeof serviceClient>,
  user: { id: string; email?: string | null },
  body: Record<string, unknown>,
) {
  const rawMessages = Array.isArray(body.messages) ? body.messages.slice(0, 60) : [];
  const messages = rawMessages
    .map((item) => {
      const value = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        role: value.role === 'a' ? ('a' as const) : ('c' as const),
        text: String(value.text ?? '').trim().slice(0, 4000),
      };
    })
    .filter((message) => message.text);

  if (
    !messages.some((message) => message.role === 'c') ||
    !messages.some((message) => message.role === 'a')
  ) {
    throw new AiError('Masukkan minimal 1 pesan customer dan 1 pesan admin.', 400);
  }

  const row = await loadSettings(service);
  const apiKey = await apiKeyFor(row);
  if (!apiKey) return notConfigured();

  await enforceRateLimit(service, user.id, 'reviewer');

  const behavior = mergeBehavior(row.behavior);
  const question = messages
    .filter((message) => message.role === 'c')
    .map((message) => message.text)
    .join(' ')
    .slice(0, 2500);
  const aiContext = await buildAiContext(service, {
    userId: user.id,
    question,
  });
  const transcript = messages
    .map((message) => `${message.role === 'c' ? 'Customer' : 'Admin'}: ${message.text}`)
    .join('\n\n');

  const model = resolveModel(row, 'reviewer');
  const started = Date.now();
  let result;
  try {
    result = await mimoChat({
      apiKey,
      baseUrl: row.base_url,
      model,
      messages: [
        { role: 'system', content: buildReviewerSystemPrompt(aiContext.context) },
        {
          role: 'user',
          content: `Nilai percakapan berikut dan kembalikan JSON sesuai format.\n\n${transcript}`,
        },
      ],
      temperature: Math.min(behavior.temperature, 0.3),
      maxTokens: Math.min(2200, Math.max(1400, behavior.maxTokens)),
      thinking: resolveThinking(row, 'reviewer'),
    });
  } catch (error) {
    const message = errorMessage(error);
    await logUsage(service, {
      userId: user.id,
      userEmail: user.email ?? null,
      feature: 'reviewer',
      model,
      status: 'error',
      error: message,
      latencyMs: Date.now() - started,
    });
    return featureError('upstream_error', message);
  }

  try {
    const normalized = normalizeReviewResult(
      result.content,
      messages.filter((message) => message.role === 'a').length,
    );
    await logUsage(service, {
      userId: user.id,
      userEmail: user.email ?? null,
      feature: 'reviewer',
      model: result.model,
      usage: result.usage,
      status: 'success',
      latencyMs: Date.now() - started,
      estimatedCost: estimateCost(result.usage, row.pricing),
    });
    return json({
      ok: true,
      model: result.model,
      usage: result.usage,
      result: normalized,
    });
  } catch (error) {
    const message = errorMessage(error);
    await logUsage(service, {
      userId: user.id,
      userEmail: user.email ?? null,
      feature: 'reviewer',
      model: result.model,
      usage: result.usage,
      status: 'error',
      error: message,
      latencyMs: Date.now() - started,
    });
    return featureError('invalid_response', message);
  }
}

async function handleSimulator(
  service: ReturnType<typeof serviceClient>,
  user: { id: string; email?: string | null },
  body: Record<string, unknown>,
) {
  const scenarioValue =
    body.scenario && typeof body.scenario === 'object'
      ? (body.scenario as Record<string, unknown>)
      : null;
  if (!scenarioValue) throw new AiError('Skenario tidak valid.', 400);

  const scenario = {
    title: String(scenarioValue.title ?? '').slice(0, 160),
    category: String(scenarioValue.category ?? '').slice(0, 80),
    level: String(scenarioValue.level ?? '').slice(0, 40),
    situation: String(scenarioValue.situation ?? '').slice(0, 1200),
    objective: String(scenarioValue.objective ?? '').slice(0, 1200),
  };

  const rawHistory = Array.isArray(body.history) ? body.history.slice(-30) : [];
  const history = rawHistory
    .map((item) => {
      const value = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        role: value.role === 'a' ? ('a' as const) : ('c' as const),
        text: String(value.text ?? '').trim().slice(0, 2000),
      };
    })
    .filter((message) => message.text);

  const row = await loadSettings(service);
  const apiKey = await apiKeyFor(row);
  if (!apiKey) return notConfigured();

  await enforceRateLimit(service, user.id, 'simulator');

  const behavior = mergeBehavior(row.behavior);
  const systemPrompt = buildSimulatorSystemPrompt(scenario);
  const chatMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
  history.forEach((message) => {
    chatMessages.push({
      role: message.role === 'c' ? 'assistant' : 'user',
      content: message.text,
    });
  });
  if (!history.length || history[history.length - 1].role === 'c') {
    chatMessages.push({ role: 'user', content: 'Lanjutkan percakapan.' });
  }

  const model = resolveModel(row, 'simulator');
  const started = Date.now();
  let result;
  try {
    result = await mimoChat({
      apiKey,
      baseUrl: row.base_url,
      model,
      messages: chatMessages,
      temperature: Math.min(0.9, Math.max(0.5, behavior.temperature + 0.25)),
      maxTokens: 180,
      thinking: resolveThinking(row, 'simulator'),
    });
  } catch (error) {
    const message = errorMessage(error);
    await logUsage(service, {
      userId: user.id,
      userEmail: user.email ?? null,
      feature: 'simulator',
      model,
      status: 'error',
      error: message,
      latencyMs: Date.now() - started,
    });
    return featureError('upstream_error', message);
  }

  const done = result.content.trim().includes(SIMULATOR_DONE);
  await logUsage(service, {
    userId: user.id,
    userEmail: user.email ?? null,
    feature: 'simulator',
    model: result.model,
    usage: result.usage,
    status: 'success',
    latencyMs: Date.now() - started,
    estimatedCost: estimateCost(result.usage, row.pricing),
  });

  return json({
    ok: true,
    done,
    message: done ? null : result.content,
    model: result.model,
    usage: result.usage,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Metode tidak didukung.' }, 405);
  }

  const auth = await requireUser(req);
  if (!auth) return json({ ok: false, error: 'Sesi tidak valid. Login ulang.' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Permintaan tidak valid.' }, 400);
  }

  const service = serviceClient();
  const user = auth.user;
  const action = String(body.action ?? '');

  try {
    if (action === 'assistant') return await handleAssistant(service, user, body);
    if (action === 'reviewer') return await handleReviewer(service, user, body);
    if (action === 'simulator') return await handleSimulator(service, user, body);
    return json({ ok: false, error: 'Aksi tidak dikenal.' }, 400);
  } catch (error) {
    const message = errorMessage(error);
    const status = error instanceof AiError ? error.status : 500;
    const code = message.includes('Terlalu banyak')
      ? 'rate_limited'
      : error instanceof AiError
        ? 'request_error'
        : 'server_error';
    if (!(error instanceof AiError)) {
      console.error('ai function error', message);
    }
    return json({ ok: false, code, error: message }, status);
  }
});
