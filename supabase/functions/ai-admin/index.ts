import {
  CORS,
  errorMessage,
  isOwner,
  json,
  requireUser,
  serviceClient,
} from '../_shared/http.ts';
import { encryptSecret, last4 } from '../_shared/crypto.ts';
import { mimoChat, mimoModels, normalizeBaseUrl, type MimoModel } from '../_shared/mimo.ts';
import {
  DEFAULT_BEHAVIOR,
  buildAssistantSystemPrompt,
  mergeBehavior,
} from '../_shared/prompts.ts';
import {
  AiError,
  apiKeyFor,
  enforceRateLimit,
  estimateCost,
  loadSettings,
  logUsage,
  publicSettings,
  resolveModel,
  type AiPricing,
  type AiSettingsRow,
} from '../_shared/settings.ts';

const MODELS_TTL_MS = 5 * 60_000;
const MODELS_CACHE_LIMIT = 60;
let modelsCache: { key: string; at: number; models: MimoModel[] } | null = null;

const PLANS = new Set(['payg', 'token_plan', 'custom']);
const FEATURES = ['assistant', 'reviewer', 'simulator'] as const;

function cleanModel(value: unknown): string {
  return String(value ?? '').trim().slice(0, 120);
}

function parsePricing(raw: unknown): AiPricing {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const pricing: AiPricing = {};
  const input = Number(value.inputPer1M);
  const output = Number(value.outputPer1M);
  if (Number.isFinite(input) && input >= 0) pricing.inputPer1M = input;
  if (Number.isFinite(output) && output >= 0) pricing.outputPer1M = output;
  if (typeof value.currency === 'string' && value.currency.trim()) {
    pricing.currency = value.currency.trim().slice(0, 8).toUpperCase();
  }
  return pricing;
}

async function settingsPayload(row: AiSettingsRow) {
  return {
    settings: publicSettings(row),
    defaults: DEFAULT_BEHAVIOR,
    encryptionReady: Boolean(Deno.env.get('AI_SETTINGS_ENCRYPTION_KEY')),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Metode tidak didukung.' }, 405);
  }

  const auth = await requireUser(req);
  if (!auth) return json({ ok: false, error: 'Sesi tidak valid. Login ulang.' }, 401);
  if (!isOwner(auth.user)) {
    return json({ ok: false, error: 'Halaman ini hanya untuk Owner.' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Permintaan tidak valid.' }, 400);
  }

  const action = String(body.action ?? '');
  const service = serviceClient();
  const user = auth.user;

  try {
    switch (action) {
      case 'get_settings': {
        const row = await loadSettings(service);
        return json({ ok: true, ...(await settingsPayload(row)) });
      }

      case 'save_provider': {
        const plan = PLANS.has(String(body.plan)) ? String(body.plan) : 'payg';
        const baseUrl = normalizeBaseUrl(String(body.baseUrl ?? ''));
        const update: Record<string, unknown> = {
          provider: 'xiaomi-mimo',
          plan,
          base_url: baseUrl,
          updated_by: user.id,
        };

        const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
        if (apiKey) {
          if (apiKey.length < 8) {
            throw new AiError('API Key terlihat tidak valid. Periksa kembali.', 400);
          }
          const encrypted = await encryptSecret(apiKey);
          update.api_key_ciphertext = encrypted.ciphertext;
          update.api_key_iv = encrypted.iv;
          update.api_key_last4 = last4(apiKey);
        }

        const { data, error } = await service
          .from('ai_settings')
          .update(update)
          .eq('id', 1)
          .select('*')
          .single();
        if (error || !data) throw new AiError('Gagal menyimpan pengaturan provider.', 500);

        return json({
          ok: true,
          message: apiKey
            ? 'API Key tersimpan terenkripsi di server.'
            : 'Pengaturan provider berhasil disimpan.',
          ...(await settingsPayload(data as AiSettingsRow)),
        });
      }

      case 'delete_key': {
        const { data, error } = await service
          .from('ai_settings')
          .update({
            api_key_ciphertext: null,
            api_key_iv: null,
            api_key_last4: null,
            updated_by: user.id,
          })
          .eq('id', 1)
          .select('*')
          .single();
        if (error || !data) throw new AiError('Gagal menghapus API Key.', 500);
        modelsCache = null;
        return json({
          ok: true,
          message: 'API Key berhasil dihapus. Fitur AI tidak akan memanggil provider sampai key baru disimpan.',
          ...(await settingsPayload(data as AiSettingsRow)),
        });
      }

      case 'test_connection': {
        await enforceRateLimit(service, user.id, 'admin_test');
        const row = await loadSettings(service);
        const providedKey =
          typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
        const apiKey = providedKey || (await apiKeyFor(row));
        if (!apiKey) throw new AiError('API Key belum tersimpan.', 400);

        const started = Date.now();
        try {
          const models = await mimoModels({ apiKey, baseUrl: row.base_url });
          const latencyMs = Date.now() - started;
          await logUsage(service, {
            userId: user.id,
            userEmail: user.email ?? null,
            feature: 'admin_test',
            model: null,
            status: 'success',
            latencyMs,
          });
          modelsCache = {
            key: `${row.base_url}|${last4(apiKey)}`,
            at: Date.now(),
            models,
          };
          return json({
            ok: true,
            message: `Koneksi berhasil. ${models.length} model tersedia.`,
            modelCount: models.length,
            latencyMs,
          });
        } catch (error) {
          const message = errorMessage(error);
          await logUsage(service, {
            userId: user.id,
            userEmail: user.email ?? null,
            feature: 'admin_test',
            model: null,
            status: 'error',
            error: message,
            latencyMs: Date.now() - started,
          });
          throw new AiError(`Tes koneksi gagal: ${message}`, 502);
        }
      }

      case 'list_models': {
        await enforceRateLimit(service, user.id, 'admin_models');
        const row = await loadSettings(service);
        const apiKey = await apiKeyFor(row);
        if (!apiKey) throw new AiError('Simpan API Key terlebih dahulu.', 400);

        const cacheKey = `${row.base_url}|${last4(apiKey)}`;
        const force = body.refresh === true;
        if (
          !force &&
          modelsCache &&
          modelsCache.key === cacheKey &&
          Date.now() - modelsCache.at < MODELS_TTL_MS
        ) {
          return json({
            ok: true,
            models: modelsCache.models,
            cached: true,
            fetchedAt: new Date(modelsCache.at).toISOString(),
          });
        }

        const started = Date.now();
        try {
          const models = await mimoModels({ apiKey, baseUrl: row.base_url });
          if (!models.length) {
            throw new Error('Provider tidak mengembalikan model apa pun.');
          }
          modelsCache = { key: cacheKey, at: Date.now(), models: models.slice(0, MODELS_CACHE_LIMIT) };
          await logUsage(service, {
            userId: user.id,
            userEmail: user.email ?? null,
            feature: 'admin_models',
            model: null,
            status: 'success',
            latencyMs: Date.now() - started,
          });
          return json({
            ok: true,
            models: modelsCache.models,
            cached: false,
            fetchedAt: new Date().toISOString(),
          });
        } catch (error) {
          const message = errorMessage(error);
          await logUsage(service, {
            userId: user.id,
            userEmail: user.email ?? null,
            feature: 'admin_models',
            model: null,
            status: 'error',
            error: message,
            latencyMs: Date.now() - started,
          });
          throw new AiError(`Gagal memuat daftar model: ${message}`, 502);
        }
      }

      case 'test_model': {
        await enforceRateLimit(service, user.id, 'admin_test');
        const row = await loadSettings(service);
        const apiKey = await apiKeyFor(row);
        if (!apiKey) throw new AiError('Simpan API Key terlebih dahulu.', 400);
        const model = cleanModel(body.model) || row.default_model;

        const started = Date.now();
        try {
          const result = await mimoChat({
            apiKey,
            baseUrl: row.base_url,
            model,
            messages: [
              {
                role: 'user',
                content: 'Balas dengan satu kata: OK. Jangan tambahkan penjelasan.',
              },
            ],
            temperature: 0,
            maxTokens: 16,
            timeoutMs: 30_000,
          });
          await logUsage(service, {
            userId: user.id,
            userEmail: user.email ?? null,
            feature: 'admin_test',
            model: result.model,
            usage: result.usage,
            status: 'success',
            latencyMs: Date.now() - started,
            estimatedCost: estimateCost(result.usage, row.pricing),
          });
          return json({
            ok: true,
            model: result.model,
            reply: result.content,
            usage: result.usage,
            latencyMs: Date.now() - started,
            message: `Model ${model} merespons dengan baik.`,
          });
        } catch (error) {
          const message = errorMessage(error);
          await logUsage(service, {
            userId: user.id,
            userEmail: user.email ?? null,
            feature: 'admin_test',
            model,
            status: 'error',
            error: message,
            latencyMs: Date.now() - started,
          });
          throw new AiError(`Tes model gagal: ${message}`, 502);
        }
      }

      case 'save_models': {
        const row = await loadSettings(service);
        const defaultModel = cleanModel(body.defaultModel) || row.default_model;
        const rawFeatureModels =
          body.featureModels && typeof body.featureModels === 'object'
            ? (body.featureModels as Record<string, unknown>)
            : {};
        const featureModels: Record<string, string> = {};
        FEATURES.forEach((feature) => {
          const model = cleanModel(rawFeatureModels[feature]);
          if (model) featureModels[feature] = model;
        });

        const { data, error } = await service
          .from('ai_settings')
          .update({
            default_model: defaultModel,
            feature_models: featureModels,
            pricing: parsePricing(body.pricing),
            updated_by: user.id,
          })
          .eq('id', 1)
          .select('*')
          .single();
        if (error || !data) throw new AiError('Gagal menyimpan pengaturan model.', 500);

        return json({
          ok: true,
          message: 'Pengaturan model berhasil disimpan.',
          ...(await settingsPayload(data as AiSettingsRow)),
        });
      }

      case 'save_behavior': {
        const behavior = mergeBehavior(body.behavior);
        const { data, error } = await service
          .from('ai_settings')
          .update({ behavior, updated_by: user.id })
          .eq('id', 1)
          .select('*')
          .single();
        if (error || !data) throw new AiError('Gagal menyimpan perilaku AI.', 500);
        return json({
          ok: true,
          message: 'Perilaku AI berhasil disimpan.',
          ...(await settingsPayload(data as AiSettingsRow)),
        });
      }

      case 'reset_behavior': {
        const { data, error } = await service
          .from('ai_settings')
          .update({ behavior: {}, updated_by: user.id })
          .eq('id', 1)
          .select('*')
          .single();
        if (error || !data) throw new AiError('Gagal mengembalikan perilaku AI.', 500);
        return json({
          ok: true,
          message: 'Perilaku AI dikembalikan ke pengaturan default.',
          ...(await settingsPayload(data as AiSettingsRow)),
        });
      }

      case 'preview_behavior': {
        const behavior = mergeBehavior(body.behavior);
        const question =
          String(body.question ?? '').trim().slice(0, 500) ||
          'Perkenalkan dirimu secara singkat dan jelaskan bagaimana kamu membantu admin Samaqu.';
        const prompt = buildAssistantSystemPrompt(behavior, '');
        const row = await loadSettings(service);
        const apiKey = await apiKeyFor(row);
        if (!apiKey) {
          return json({
            ok: true,
            prompt,
            answer: null,
            message: 'API Key belum tersimpan. Preview instruksi ditampilkan tanpa memanggil model.',
          });
        }

        await enforceRateLimit(service, user.id, 'admin_test');
        const model = resolveModel(row, 'assistant');
        const started = Date.now();
        try {
          const result = await mimoChat({
            apiKey,
            baseUrl: row.base_url,
            model,
            messages: [
              { role: 'system', content: prompt },
              { role: 'user', content: question },
            ],
            temperature: behavior.temperature,
            maxTokens: Math.min(400, behavior.maxTokens),
            timeoutMs: 30_000,
          });
          await logUsage(service, {
            userId: user.id,
            userEmail: user.email ?? null,
            feature: 'admin_test',
            model: result.model,
            usage: result.usage,
            status: 'success',
            latencyMs: Date.now() - started,
            estimatedCost: estimateCost(result.usage, row.pricing),
          });
          return json({
            ok: true,
            prompt,
            answer: result.content,
            model: result.model,
            usage: result.usage,
          });
        } catch (error) {
          const message = errorMessage(error);
          await logUsage(service, {
            userId: user.id,
            userEmail: user.email ?? null,
            feature: 'admin_test',
            model,
            status: 'error',
            error: message,
            latencyMs: Date.now() - started,
          });
          throw new AiError(`Preview gagal: ${message}`, 502);
        }
      }

      case 'get_usage': {
        const limit = Math.max(1, Math.min(200, Number(body.limit) || 100));
        const feature = String(body.feature ?? '').trim();
        let query = service
          .from('ai_usage_logs')
          .select(
            'id,user_email,feature,model,prompt_tokens,completion_tokens,total_tokens,status,error,latency_ms,estimated_cost,created_at',
          )
          .order('created_at', { ascending: false })
          .limit(limit);
        if (feature) query = query.eq('feature', feature);
        const { data, error } = await query;
        if (error) throw new AiError('Gagal memuat log penggunaan AI.', 500);
        return json({ ok: true, logs: data ?? [] });
      }

      default:
        return json({ ok: false, error: 'Aksi tidak dikenal.' }, 400);
    }
  } catch (error) {
    const status = error instanceof AiError ? error.status : 500;
    const message =
      error instanceof AiError
        ? error.message
        : errorMessage(error) || 'Terjadi kesalahan pada pengaturan AI.';
    if (!(error instanceof AiError)) {
      console.error('ai-admin error', message);
    }
    return json({ ok: false, error: message }, status);
  }
});
