import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { normalizeBaseUrl } from './mimo.ts';
import { AiError, type AiPricing } from './settings.ts';

/**
 * Profil provider AI: Xiaomi MiMo (langsung), Command Code, dan Custom.
 *
 * `ai_settings` tetap SATU-SATUNYA sumber yang dibaca fungsi AI (ai, ai-admin, wa-agent). Modul ini
 * hanya mengelola tabel `ai_provider_profiles` dan menyalin profil yang dipilih ke `ai_settings` lewat
 * fungsi SQL `activate_ai_profile()` (atomik). Kalau migrasi belum diterapkan, semua aksi di sini
 * mengembalikan `profilesReady: false` dan halaman admin memakai tampilan lama.
 *
 * Dependensi (enkripsi, log, rate limit) di-inject lewat `ProfileCtx` supaya modul ini bisa diuji tanpa Deno.
 */

export const PROFILE_IDS = ['xiaomi', 'commandcode', 'custom'] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];
export const PROFILE_FEATURES = ['assistant', 'reviewer', 'simulator'] as const;

export const PRESET_DEFAULTS: Record<ProfileId, { label: string; baseUrl: string; defaultModel: string }> = {
  xiaomi: { label: 'Xiaomi MiMo (langsung)', baseUrl: 'https://api.xiaomimimo.com/v1', defaultModel: 'mimo-v2.6-pro' },
  commandcode: {
    label: 'Command Code',
    baseUrl: 'https://api.commandcode.ai/provider/v1',
    defaultModel: 'xiaomi/mimo-v2.6-flash',
  },
  custom: { label: 'Custom (kompatibel OpenAI)', baseUrl: '', defaultModel: '' },
};

export interface ProfileRow {
  id: ProfileId;
  label: string;
  base_url: string;
  api_key_ciphertext: string | null;
  api_key_iv: string | null;
  api_key_last4: string | null;
  default_model: string;
  feature_models: Record<string, string> | null;
  pricing: AiPricing | null;
  is_active: boolean;
  last_active_at: string | null;
  updated_at?: string | null;
}

export interface PublicProfile {
  id: ProfileId;
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

export interface ProfilesPayload {
  profilesReady: boolean;
  profiles: PublicProfile[];
  activeProfileId: ProfileId | null;
  previousProfileId: ProfileId | null;
}

export interface ProbeResult {
  ok: boolean;
  latencyMs: number;
  /** Isi jawaban; bisa kosong pada model reasoning walau koneksinya sehat. */
  reply: string;
  /** Pesan siap tampil (sukses atau penyebab gagal). */
  message: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface ModelInfo {
  id: string;
  ownedBy: string;
  /** false bila provider menyebut model ini TIDAK melayani /chat/completions (mis. model Claude di Command Code). */
  chat: boolean;
}

export interface ProfileCtx {
  service: SupabaseClient;
  user: { id: string; email?: string | null };
  encrypt: (plain: string) => Promise<{ ciphertext: string; iv: string }>;
  decrypt: (ciphertext: string, iv: string) => Promise<string>;
  last4: (plain: string) => string;
  enforceRateLimit: () => Promise<void>;
  logUsage: (entry: {
    model: string | null;
    status: 'success' | 'error';
    error?: string | null;
    latencyMs: number;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  }) => Promise<void>;
  /** Payload `ai_settings` terbaru (dibaca ulang setelah perubahan). */
  settingsPayload: () => Promise<Record<string, unknown>>;
  /** Dipanggil setelah ai_settings berubah (mis. kosongkan cache daftar model). */
  afterSettingsChange?: () => void;
  fetchImpl?: typeof fetch;
}

export const PROFILE_ACTIONS = new Set([
  'list_profiles',
  'save_profile',
  'delete_profile_key',
  'test_profile',
  'list_profile_models',
  'activate_profile',
  'rollback_profile',
]);

/* ── bentuk data ── */

export function publicProfile(row: ProfileRow): PublicProfile {
  return {
    id: row.id,
    label: row.label,
    baseUrl: row.base_url,
    hasApiKey: Boolean(row.api_key_ciphertext && row.api_key_iv),
    apiKeyLast4: row.api_key_last4,
    defaultModel: row.default_model,
    featureModels: row.feature_models ?? {},
    pricing: row.pricing ?? {},
    isActive: row.is_active,
    lastActiveAt: row.last_active_at,
  };
}

/** Profil non-aktif yang paling baru dipakai dan punya kunci — tujuan tombol "Kembali". */
export function pickPrevious(rows: ProfileRow[]): ProfileRow | null {
  const candidates = rows
    .filter((row) => !row.is_active && row.last_active_at && row.api_key_ciphertext && row.api_key_iv)
    .sort((a, b) => String(b.last_active_at).localeCompare(String(a.last_active_at)));
  return candidates[0] ?? null;
}

export function profilesPayload(rows: ProfileRow[], ready: boolean): ProfilesPayload {
  if (!ready) return { profilesReady: false, profiles: [], activeProfileId: null, previousProfileId: null };
  const order = new Map(PROFILE_IDS.map((id, index) => [id as string, index]));
  const sorted = [...rows].sort((a, b) => (order.get(a.id) ?? 9) - (order.get(b.id) ?? 9));
  return {
    profilesReady: true,
    profiles: sorted.map(publicProfile),
    activeProfileId: sorted.find((row) => row.is_active)?.id ?? null,
    previousProfileId: pickPrevious(sorted)?.id ?? null,
  };
}

/** Tabel profil belum ada (migrasi belum diterapkan) — jangan dianggap galat. */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const text = String(error.message ?? '');
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /ai_provider_profiles/.test(text) && /(does not exist|schema cache|could not find)/i.test(text)
  );
}

export async function loadProfiles(service: SupabaseClient): Promise<{ ready: boolean; rows: ProfileRow[] }> {
  const { data, error } = await service.from('ai_provider_profiles').select('*').order('id');
  if (error) {
    if (isMissingTable(error)) return { ready: false, rows: [] };
    throw new AiError('Gagal membaca profil provider dari database.', 500);
  }
  return { ready: true, rows: (data ?? []) as ProfileRow[] };
}

/* ── validasi input ── */

export function cleanModelId(value: unknown): string {
  return String(value ?? '').trim().slice(0, 120);
}

export function cleanFeatureModels(raw: unknown): Record<string, string> {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const feature of PROFILE_FEATURES) {
    const model = cleanModelId(source[feature]);
    if (model) out[feature] = model;
  }
  return out;
}

export function cleanPricing(raw: unknown): AiPricing {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const pricing: AiPricing = {};
  const input = Number(value.inputPer1M);
  const output = Number(value.outputPer1M);
  if (value.inputPer1M !== '' && value.inputPer1M != null && Number.isFinite(input) && input >= 0) pricing.inputPer1M = input;
  if (value.outputPer1M !== '' && value.outputPer1M != null && Number.isFinite(output) && output >= 0) pricing.outputPer1M = output;
  if (typeof value.currency === 'string' && value.currency.trim()) {
    pricing.currency = value.currency.trim().slice(0, 8).toUpperCase();
  }
  return pricing;
}

/** normalizeBaseUrl melempar Error biasa; ubah jadi AiError 400 supaya pesannya tampil apa adanya. */
export function safeBaseUrl(raw: string): string {
  try {
    return normalizeBaseUrl(raw);
  } catch (error) {
    throw new AiError(String((error as Error)?.message || "Base URL tidak valid."), 400);
  }
}

export function isProfileId(value: unknown): value is ProfileId {
  return typeof value === 'string' && (PROFILE_IDS as readonly string[]).includes(value);
}

/* ── panggilan ke provider ── */

function providerMessage(status: number, bodyText: string, model: string): string {
  let detail = '';
  try {
    const data = JSON.parse(bodyText);
    let message = data?.error?.message ?? data?.message ?? '';
    // Gateway kadang membungkus galat sebagai string JSON di dalam string JSON.
    if (typeof message === 'string' && message.trim().startsWith('{')) {
      try {
        const inner = JSON.parse(message);
        message = inner?.error?.message ?? inner?.message ?? message;
      } catch {
        /* biarkan apa adanya */
      }
    }
    detail = String(message ?? '').replace(/\s+/g, ' ').slice(0, 160);
  } catch {
    detail = bodyText.replace(/\s+/g, ' ').slice(0, 120);
  }
  if (status === 401 || status === 403) return `Kunci ditolak provider (${status}). Periksa API Key.`;
  if (status === 402) return 'Saldo/kredit akun provider habis (402). Top up dulu.';
  if (status === 404) return `Alamat atau model tidak ditemukan (404): ${detail || model}`;
  if (status === 429) return 'Provider membatasi permintaan (429). Coba lagi sebentar.';
  if (status === 400 && /not supported|unsupported|invalid.*model|model.*not/i.test(detail)) {
    return `Model "${model}" tidak didukung provider ini. Periksa penulisan id model.`;
  }
  return `Provider menolak permintaan (${status})${detail ? `: ${detail}` : ''}`;
}

export async function probeModel(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<ProbeResult> {
  const fetcher = options.fetchImpl ?? fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  try {
    const response = await fetcher(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'api-key': options.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: 'user', content: 'Balas dengan satu kata: OK.' }],
        temperature: 0,
        // Cukup longgar untuk model reasoning: dengan 16 token isi jawaban hampir selalu kosong.
        max_completion_tokens: 200,
        thinking: { type: 'disabled' },
        stream: false,
      }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, latencyMs, reply: '', message: providerMessage(response.status, text, options.model) };
    }
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, latencyMs, reply: '', message: 'Provider menjawab bukan JSON. Periksa Base URL.' };
    }
    const choice = Array.isArray(data.choices) ? (data.choices[0] as Record<string, unknown> | undefined) : undefined;
    if (!choice) {
      return { ok: false, latencyMs, reply: '', message: 'Respons provider tidak berisi jawaban. Periksa Base URL.' };
    }
    const message = (choice.message ?? {}) as Record<string, unknown>;
    const reply = String(message.content ?? choice.text ?? '').replace(/\s+/g, ' ').trim();
    const rawUsage = (data.usage ?? {}) as Record<string, unknown>;
    const usage = {
      promptTokens: Number(rawUsage.prompt_tokens) || 0,
      completionTokens: Number(rawUsage.completion_tokens) || 0,
      totalTokens: Number(rawUsage.total_tokens) || 0,
    };
    const note = reply
      ? `Model ${options.model} merespons: "${reply.slice(0, 40)}" (${latencyMs} ms).`
      : `Model ${options.model} terhubung (${latencyMs} ms). Isi jawaban kosong karena model memakai token untuk reasoning; ini normal.`;
    return { ok: true, latencyMs, reply, message: note, usage };
  } catch (error) {
    const latencyMs = Date.now() - started;
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, latencyMs, reply: '', message: 'Provider tidak merespons dalam 30 detik.' };
    }
    return { ok: false, latencyMs, reply: '', message: `Tidak bisa menghubungi provider: ${String((error as Error)?.message ?? error)}` };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchModelList(options: {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<ModelInfo[]> {
  const fetcher = options.fetchImpl ?? fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetcher(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${options.apiKey}`, 'api-key': options.apiKey },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new AiError(providerMessage(response.status, text, ''), 502);
    const data = JSON.parse(text);
    const rows = Array.isArray(data?.data) ? data.data : [];
    return rows
      .map((item: unknown): ModelInfo | null => {
        if (!item || typeof item !== 'object') return null;
        const value = item as Record<string, unknown>;
        const id = String(value.id ?? '').trim();
        if (!id) return null;
        const endpoints = Array.isArray(value.supported_endpoints) ? (value.supported_endpoints as unknown[]).map(String) : null;
        return {
          id,
          ownedBy: String(value.owned_by ?? ''),
          chat: endpoints ? endpoints.includes('/chat/completions') : true,
        };
      })
      .filter(Boolean)
      .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id)) as ModelInfo[];
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw new AiError(`Gagal memuat daftar model: ${String((error as Error)?.message ?? error)}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

/* ── aksi ── */

async function requireReady(ctx: ProfileCtx) {
  const { ready, rows } = await loadProfiles(ctx.service);
  if (!ready) {
    throw new AiError('Fitur profil provider belum aktif: migrasi 20261114_ai_provider_profiles.sql belum diterapkan.', 409);
  }
  return rows;
}

function findRow(rows: ProfileRow[], id: unknown): ProfileRow {
  if (!isProfileId(id)) throw new AiError('Profil tidak dikenal.', 400);
  const row = rows.find((item) => item.id === id);
  if (!row) throw new AiError('Profil tidak ditemukan di database.', 404);
  return row;
}

async function keyOf(ctx: ProfileCtx, row: ProfileRow, typed: unknown): Promise<string> {
  const provided = typeof typed === 'string' ? typed.trim() : '';
  if (provided) return provided;
  if (!row.api_key_ciphertext || !row.api_key_iv) {
    throw new AiError(`Profil ${row.label} belum punya API Key. Simpan kuncinya dulu.`, 400);
  }
  try {
    return await ctx.decrypt(row.api_key_ciphertext, row.api_key_iv);
  } catch {
    throw new AiError('API Key tersimpan tidak dapat dibuka. Simpan ulang API Key profil ini.', 500);
  }
}

async function reply(ctx: ProfileCtx, message: string, extra: Record<string, unknown> = {}) {
  const { ready, rows } = await loadProfiles(ctx.service);
  return { ok: true, message, ...profilesPayload(rows, ready), ...(await ctx.settingsPayload()), ...extra };
}

async function probeAndLog(ctx: ProfileCtx, input: { baseUrl: string; apiKey: string; model: string }): Promise<ProbeResult> {
  await ctx.enforceRateLimit();
  const result = await probeModel({ ...input, fetchImpl: ctx.fetchImpl });
  await ctx.logUsage({
    model: input.model,
    status: result.ok ? 'success' : 'error',
    error: result.ok ? null : result.message,
    latencyMs: result.latencyMs,
    usage: result.usage ?? null,
  });
  return result;
}

async function activate(ctx: ProfileCtx, row: ProfileRow, skipTest: boolean, verb: string) {
  if (row.is_active) throw new AiError(`${row.label} sudah aktif.`, 400);
  if (!row.api_key_ciphertext || !row.api_key_iv) throw new AiError(`${row.label} belum punya API Key.`, 400);
  if (!row.base_url.trim() || !row.default_model.trim()) {
    throw new AiError(`${row.label} belum lengkap: isi Base URL dan model default dulu.`, 400);
  }
  if (!skipTest) {
    const apiKey = await keyOf(ctx, row, null);
    const probe = await probeAndLog(ctx, { baseUrl: row.base_url, apiKey, model: row.default_model });
    if (!probe.ok) throw new AiError(`Tes ${row.label} gagal, TIDAK dipindah. ${probe.message}`, 422);
  }
  const { error } = await ctx.service.rpc('activate_ai_profile', { p_id: row.id, p_user: ctx.user.id });
  if (error) throw new AiError(`Gagal ${verb} ${row.label}: ${String(error.message ?? error)}`, 500);
  ctx.afterSettingsChange?.();
  return reply(ctx, `${row.label} sekarang aktif untuk semua fitur AI (bot WA, Assistant, Reviewer).`);
}

export async function handleProfileAction(
  action: string,
  body: Record<string, unknown>,
  ctx: ProfileCtx,
): Promise<Record<string, unknown>> {
  switch (action) {
    case 'list_profiles': {
      const { ready, rows } = await loadProfiles(ctx.service);
      return { ok: true, ...profilesPayload(rows, ready) };
    }

    case 'save_profile': {
      const rows = await requireReady(ctx);
      const id = body.id;
      if (!isProfileId(id)) throw new AiError('Profil tidak dikenal.', 400);
      const existing = rows.find((row) => row.id === id) ?? null;
      const preset = PRESET_DEFAULTS[id];

      const rawBase = String(body.baseUrl ?? '').trim();
      if (!rawBase && id === 'custom') throw new AiError('Base URL wajib diisi untuk profil Custom.', 400);
      const baseUrl = safeBaseUrl(rawBase || preset.baseUrl);
      const defaultModel = cleanModelId(body.defaultModel);
      if (!defaultModel) throw new AiError('Model default wajib diisi.', 400);

      const update: Record<string, unknown> = {
        id,
        label: existing?.label ?? preset.label,
        base_url: baseUrl,
        default_model: defaultModel,
        feature_models: cleanFeatureModels(body.featureModels),
        pricing: cleanPricing(body.pricing),
        updated_by: ctx.user.id,
      };

      const typedKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
      if (typedKey) {
        if (typedKey.length < 8) throw new AiError('API Key terlihat tidak valid. Periksa kembali.', 400);
        const encrypted = await ctx.encrypt(typedKey);
        update.api_key_ciphertext = encrypted.ciphertext;
        update.api_key_iv = encrypted.iv;
        update.api_key_last4 = ctx.last4(typedKey);
      }

      // Profil AKTIF dipakai bot saat ini: perubahan penting harus lolos tes dulu, supaya nama model /
      // kunci / alamat yang salah tidak langsung merusak balasan.
      const changedCritical =
        !existing ||
        existing.base_url !== baseUrl ||
        existing.default_model !== defaultModel ||
        Boolean(typedKey);
      if (existing?.is_active && changedCritical && body.skipTest !== true) {
        const apiKey = typedKey || (await keyOf(ctx, existing, null));
        const probe = await probeAndLog(ctx, { baseUrl, apiKey, model: defaultModel });
        if (!probe.ok) {
          throw new AiError(`Tes gagal, perubahan TIDAK disimpan karena profil ini sedang aktif. ${probe.message}`, 422);
        }
      }

      const { error } = await ctx.service.from('ai_provider_profiles').upsert(update, { onConflict: 'id' });
      if (error) throw new AiError('Gagal menyimpan profil provider.', 500);

      if (existing?.is_active) {
        const applied = await ctx.service.rpc('activate_ai_profile', { p_id: id, p_user: ctx.user.id });
        if (applied.error) {
          throw new AiError(`Profil tersimpan tetapi gagal diterapkan: ${String(applied.error.message ?? applied.error)}`, 500);
        }
        ctx.afterSettingsChange?.();
      }
      return reply(ctx, existing?.is_active ? 'Tersimpan dan langsung berlaku untuk semua fitur AI.' : 'Profil tersimpan. Belum aktif; klik "Jadikan aktif" untuk memakainya.');
    }

    case 'delete_profile_key': {
      const rows = await requireReady(ctx);
      const row = findRow(rows, body.id);
      if (row.is_active) {
        throw new AiError('Profil yang sedang aktif tidak boleh dihapus kuncinya. Aktifkan profil lain dulu.', 409);
      }
      const { error } = await ctx.service
        .from('ai_provider_profiles')
        .update({ api_key_ciphertext: null, api_key_iv: null, api_key_last4: null, updated_by: ctx.user.id })
        .eq('id', row.id);
      if (error) throw new AiError('Gagal menghapus API Key profil.', 500);
      return reply(ctx, `API Key ${row.label} dihapus.`);
    }

    case 'test_profile': {
      const rows = await requireReady(ctx);
      const row = findRow(rows, body.id);
      const apiKey = await keyOf(ctx, row, body.apiKey);
      const rawBase = String(body.baseUrl ?? '').trim();
      const baseUrl = rawBase || row.base_url || PRESET_DEFAULTS[row.id].baseUrl;
      const model = cleanModelId(body.model) || row.default_model;
      if (!baseUrl.trim()) throw new AiError('Base URL belum diisi.', 400);
      if (!model) throw new AiError('Model belum diisi.', 400);
      const probe = await probeAndLog(ctx, { baseUrl, apiKey, model });
      if (!probe.ok) throw new AiError(`Tes gagal: ${probe.message}`, 502);
      return { ok: true, message: probe.message, latencyMs: probe.latencyMs, reply: probe.reply, model };
    }

    case 'list_profile_models': {
      const rows = await requireReady(ctx);
      const row = findRow(rows, body.id);
      const apiKey = await keyOf(ctx, row, body.apiKey);
      const rawBase = String(body.baseUrl ?? '').trim();
      const baseUrl = rawBase || row.base_url || PRESET_DEFAULTS[row.id].baseUrl;
      const models = await fetchModelList({ baseUrl, apiKey, fetchImpl: ctx.fetchImpl });
      return { ok: true, models, count: models.length };
    }

    case 'activate_profile': {
      const rows = await requireReady(ctx);
      const row = findRow(rows, body.id);
      return activate(ctx, row, body.skipTest === true, 'memindah ke');
    }

    case 'rollback_profile': {
      const rows = await requireReady(ctx);
      const previous = pickPrevious(rows);
      if (!previous) throw new AiError('Belum ada profil sebelumnya yang bisa dikembalikan.', 404);
      return activate(ctx, previous, body.skipTest === true, 'mengembalikan ke');
    }

    default:
      throw new AiError('Aksi profil tidak dikenal.', 400);
  }
}

/** Untuk get_settings: payload profil yang tidak pernah melempar galat (halaman lama tetap jalan). */
export async function safeProfilesPayload(service: SupabaseClient): Promise<ProfilesPayload> {
  try {
    const { ready, rows } = await loadProfiles(service);
    return profilesPayload(rows, ready);
  } catch {
    return profilesPayload([], false);
  }
}
