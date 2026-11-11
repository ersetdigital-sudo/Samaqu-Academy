import { errorMessage, json, serviceClient } from '../_shared/http.ts';
import { apiKeyFor, estimateCost, loadSettings, logUsage, priceForModel } from '../_shared/settings.ts';
import { mergeBehavior } from '../_shared/prompts.ts';
import { WA_AGENT_RULES } from '../_shared/prompts.ts';
import {
  mimoChatWithTools,
  type MimoToolCall,
  type ToolChatMessage,
} from '../_shared/mimo-tools.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { executeTool, opsFetch, WA_TOOLS, type ToolContext } from './tools.ts';
import { isWaOnline, waktuSekarangWib } from '../_shared/wa/schedule.mjs';

/**
 * Bot CS WhatsApp versi server.
 *
 *   GET  → health check (tanpa rahasia)
 *   POST → jalankan satu batch:
 *          - WA_AGENT_DRY=1 (default): mode uji, TIDAK kirim WA, TIDAK tulis lead.
 *            Kirim body { pesan, pengirim, nama } untuk mencoba balasan.
 *          - WA_AGENT_DRY=0: klaim `wa_inbox` lewat API SAMAQU, balas lewat Fonnte,
 *            lalu tandai sent/skip. Semua tetap lewat API /api/ops/* (aturan sistem).
 *
 * Auth: header `x-wa-secret` atau query `?key=` harus sama dengan WA_AGENT_SECRET.
 * Persona & memory dibaca dari database Academy (ai_settings.behavior + memory_items).
 */

const MAX_ROUNDS = 8;

const SAMAQU_SUPA_URL = Deno.env.get('SAMAQU_SUPABASE_URL') || '';
const SAMAQU_SERVICE_KEY = Deno.env.get('SAMAQU_SERVICE_ROLE_KEY') || '';

/** Update langsung tabel wa_inbox SAMAQU (service role) untuk melepas pesan macet. */
async function samaquPatch(pathname: string, body: unknown): Promise<void> {
  if (!SAMAQU_SUPA_URL || !SAMAQU_SERVICE_KEY) return;
  try {
    await fetch(`${SAMAQU_SUPA_URL}/rest/v1/${pathname}`, {
      method: 'PATCH',
      headers: {
        apikey: SAMAQU_SERVICE_KEY,
        Authorization: `Bearer ${SAMAQU_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    // pengaman; jangan gagalkan run
  }
}

function looksLikeAdLead(text: string): boolean {
  const t = String(text || '').toLowerCase();
  if (t.includes('create your price')) return true;
  return t.includes('info lebih lanjut') && t.includes('cara order');
}

/** Nama tool yang boleh dijalankan dari markup teks (batasi ke daftar resmi). */
const WA_TOOL_NAMES = new Set(WA_TOOLS.map((tool) => tool.function.name));

/**
 * Model kadang menulis panggilan tool sebagai TEKS, bukan `tool_calls` terstruktur:
 *
 *   <tool_call><function=catat_closing><parameter=nomor>628…</parameter></tool_call>
 *
 * Tanpa ini markup tersebut cuma jadi teks yang dibuang sebelum dikirim ke customer
 * (`cleanForCustomer`), sehingga aksinya — mis. mencatat closing — tidak pernah jalan.
 * Dipakai HANYA kalau provider tidak mengirim `tool_calls`; nama tool wajib ada di
 * daftar `WA_TOOLS`, dan hasilnya selalu argumen JSON yang divalidasi `executeTool`.
 */
function parseTextToolCalls(content: string): MimoToolCall[] {
  const text = String(content || '');
  if (!/<tool_call/i.test(text)) return [];

  const calls: MimoToolCall[] = [];
  // Markup ini sering TERPOTONG karena model kehabisan token (proof_url + alamat panjang),
  // jadi blok diambil sampai `</tool_call>` ATAU akhir teks.
  const callRe = /<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/gi;
  for (const block of text.matchAll(callRe)) {
    const inner = block[1] || '';
    const name = (inner.match(/<function[=\s]+([a-z0-9_]+)\s*>/i)?.[1] || '').toLowerCase();
    if (!name || !WA_TOOL_NAMES.has(name)) continue;

    const args: Record<string, string> = {};
    // Parameter juga bisa terpotong: nilainya berhenti di `</parameter>` atau parameter berikut.
    for (const chunk of inner.split(/<parameter[=\s]+/i).slice(1)) {
      const parsed = chunk.match(/^([a-z0-9_]+)\s*>([\s\S]*)$/i);
      if (!parsed) continue;
      // Buang juga sisa tag yang ikut terpotong (mis. nilai berakhir "</param").
      args[parsed[1].toLowerCase()] = parsed[2]
        .split(/<\/parameter>/i)[0]
        .replace(/<\/?[a-z_]*$/i, '')
        .trim();
    }

    calls.push({
      id: `text_${name}_${calls.length}_${Date.now()}`,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    });
  }
  return calls;
}

/** Buang baris laporan internal dari teks yang akan dikirim ke customer. */
function cleanForCustomer(text: string): string {
  // JANGAN pernah kirim markup tool ke customer. Model kadang menulis
  // <tool_call>/<parameter> sebagai teks biasa; itu internal, bukan balasan.
  if (/<tool_call|<function=|<\/?parameter|<parameter=/i.test(text)) return '';
  const lines = String(text || '').split(/\r?\n/);
  const cut = lines.findIndex((line) =>
    /^\s*(\d+\s+nomor ditangani|laporan\s*:)/i.test(line),
  );
  return (cut >= 0 ? lines.slice(0, cut) : lines).join('\n').trim();
}

/** Baca tabel SAMAQU (service role) tanpa menulis apa pun. */
async function samaquGet(pathname: string): Promise<any> {
  if (!SAMAQU_SUPA_URL || !SAMAQU_SERVICE_KEY) return null;
  try {
    const res = await fetch(`${SAMAQU_SUPA_URL}/rest/v1/${pathname}`, {
      headers: { apikey: SAMAQU_SERVICE_KEY, Authorization: `Bearer ${SAMAQU_SERVICE_KEY}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Ambil JSON dari database SAMAQU (service role, read-only) dengan timeout + retry.
 * Dipakai untuk data yang harus selalu ada di prompt (stok bonus), jadi tidak boleh
 * menggantung lama atau menyerah pada kegagalan sesaat.
 */
async function samaquJson(pathname: string, init: RequestInit = {}, attempts = 3): Promise<any> {
  if (!SAMAQU_SUPA_URL || !SAMAQU_SERVICE_KEY) throw new Error('Database SAMAQU belum dikonfigurasi');
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    try {
      const res = await fetch(`${SAMAQU_SUPA_URL}${pathname}`, {
        ...init,
        signal: controller.signal,
        headers: {
          apikey: SAMAQU_SERVICE_KEY,
          Authorization: `Bearer ${SAMAQU_SERVICE_KEY}`,
          ...(init.headers || {}),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('gagal membaca data SAMAQU');
}

/**
 * Cek apakah URL lampiran benar-benar gambar yang bisa diambil.
 *
 * URL media Fonnte kedaluwarsa (404 `text/plain`); kalau URL seperti itu dikirim ke
 * provider sebagai `image_url`, seluruh request ditolak 400 dan run mati.
 */
async function isFetchableImage(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    const type = String(res.headers.get('content-type') || '').toLowerCase();
    try {
      await res.body?.cancel();
    } catch {
      // isi tidak dipakai
    }
    return res.ok && type.startsWith('image/');
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Status stok Cover & Hanger untuk bonus promo — dibaca LANGSUNG dari stok produk
 * (`product_variant_stock`, stok efektif), bukan dari kuota/pengaturan promo.
 *
 * Sumber 1: view `product_variant_stock`. Kalau kosong/gagal → sumber 2: RPC
 * `samaqu_effective_stock_map` (fungsi yang sama yang dipakai halaman ops).
 * Kalau dua-duanya benar-benar tidak terbaca, blok tetap dikirim dengan larangan
 * menawarkan bonus — bukan diam seolah stok tersedia.
 */
async function bonusStockContext(): Promise<string> {
  const THOBE = 'Cover Thobe + Hanger';
  const KOKO = 'Cover Koko + Hanger';

  const fromView = async (): Promise<Map<string, number>> => {
    const rows = await samaquJson(
      '/rest/v1/product_variant_stock?select=color,effective_stock&product_id=eq.cover-hanger',
    );
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('view kosong');
    return new Map(rows.map((row: any) => [String(row.color), Number(row.effective_stock) || 0]));
  };

  const fromRpc = async (): Promise<Map<string, number>> => {
    const rows = await samaquJson('/rest/v1/rpc/samaqu_effective_stock_map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const map = new Map<string, number>();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row?.product_id === 'cover-hanger') map.set(String(row.color), Number(row.effective_stock) || 0);
    }
    if (map.size === 0) throw new Error('rpc kosong');
    return map;
  };

  let stock: Map<string, number> | null = null;
  try {
    stock = await fromView();
  } catch {
    try {
      stock = await fromRpc();
    } catch {
      stock = null;
    }
  }

  if (!stock) {
    return [
      'STATUS BONUS (stok langsung dari produk):',
      '- Stok Cover & Hanger TIDAK TERBACA saat ini.',
      '- Jangan menawarkan atau menulis bonus free cover + hanger di balasan ini.',
    ].join('\n');
  }

  const thobe = stock.get(THOBE) ?? 0;
  const koko = stock.get(KOKO) ?? 0;
  const hasThobe = stock.has(THOBE);
  const hasKoko = stock.has(KOKO);

  return [
    'STATUS BONUS (stok langsung dari produk, BUKAN kuota promo):',
    `- ${THOBE}: ${hasThobe ? thobe : 'tidak ada varian'}`,
    `- ${KOKO}: ${hasKoko ? koko : 'tidak ada varian'}`,
    thobe > 0
      ? '- Pembelian Thobe/Kandora: bonus Cover Thobe masih tersedia, boleh ditawarkan.'
      : '- Pembelian Thobe/Kandora: Cover Thobe + Hanger HABIS. JANGAN menawarkan atau menulis free cover + hanger. Kalau ditanya, jawab jujur sedang kosong.',
    koko > 0
      ? '- Pembelian Koko: bonus Cover Koko masih tersedia, boleh ditawarkan.'
      : '- Pembelian Koko: Cover Koko + Hanger HABIS. JANGAN menawarkan bonus cover untuk Koko.',
  ].join('\n');
}

/** Jeda singkat 4 detik, sama seperti worker lokal; pesan beruntun tetap digabung. */
async function debounceNewest(): Promise<void> {
  const rows = await samaquGet(
    'wa_inbox?select=created_at&status=eq.pending&order=created_at.desc&limit=1',
  );
  const createdAt = Array.isArray(rows) ? rows[0]?.created_at : null;
  if (!createdAt) return;
  const age = Date.now() - new Date(createdAt).getTime();
  const wait = Math.min(Math.max(0, 4_000 - age), 5_000);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/** Kunci per nomor WA: satu percakapan hanya diproses satu run. */
async function acquireLock(
  service: SupabaseClient,
  sender: string,
  owner: string,
): Promise<boolean> {
  try {
    const staleBefore = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const { data: existing } = await service
      .from('wa_agent_locks')
      .select('locked_at')
      .eq('sender', sender)
      .maybeSingle();
    if (existing?.locked_at && new Date(existing.locked_at).toISOString() > staleBefore) {
      return false;
    }
    const { error } = await service
      .from('wa_agent_locks')
      .upsert({ sender, locked_at: new Date().toISOString(), owner }, { onConflict: 'sender' });
    return !error;
  } catch {
    return false;
  }
}

async function releaseLock(service: SupabaseClient, sender: string): Promise<void> {
  try {
    await service.from('wa_agent_locks').delete().eq('sender', sender);
  } catch {
    // lock basi akan diambil alih setelah 3 menit
  }
}

function secretOk(req: Request): boolean {
  const expected = Deno.env.get('WA_AGENT_SECRET') || '';
  const url = new URL(req.url);
  const given = req.headers.get('x-wa-secret') || url.searchParams.get('key') || '';
  if (expected && given === expected) return true;

  // Trigger langsung dari webhook SAMAQU (secret terpisah, cron lama tetap jalan).
  const trigger = Deno.env.get('WA_TRIGGER_SECRET') || '';
  if (trigger && given === trigger) return true;

  // Fallback untuk pemanggilan server-side dengan service role.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return Boolean(serviceKey && bearer === serviceKey);
}

function isDry(): boolean {
  return (Deno.env.get('WA_AGENT_DRY') ?? '1') !== '0';
}

function batchSize(): number {
  const value = Number(Deno.env.get('WA_AGENT_BATCH') || 3);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1), 5) : 3;
}

async function memoryContext(service: SupabaseClient): Promise<string> {
  const { data, error } = await service
    .from('memory_items')
    .select('title,category,content')
    .eq('status', 'published')
    .order('category', { ascending: true })
    .order('title', { ascending: true });
  if (error) return '';
  return (data ?? [])
    .map((doc) => `[M] ${doc.title} | Kategori: ${doc.category}\n${doc.content}`)
    .join('\n\n');
}

function historyText(item: any): string {
  const history = Array.isArray(item?.riwayat) ? item.riwayat : [];
  const lines = history
    .map((h: any) => {
      const parts: string[] = [];
      if (h.message) parts.push(`    Customer: ${h.message}`);
      if (h.reply_text) parts.push(`    Kami: ${String(h.reply_text).replace(/\s+/g, ' ').slice(0, 180)}`);
      return parts.join('\n');
    })
    .filter(Boolean);
  return lines.length ? `  Konteks sebelumnya:\n${lines.join('\n')}\n` : '';
}

function inboxPrompt(items: any[]): string {
  const rows = items.map((item) => {
    const attachment = item.media_url
      ? `\n  Lampiran gambar: ${item.media_url}${item.filename ? ` (${item.filename})` : ''}`
      : '';
    const instructions = Array.isArray(item.instruksi)
      ? item.instruksi
          .map((entry: any) => `  Instruksi admin${entry.scope === 'global' ? ' (semua)' : ''}: ${entry.instruction}`)
          .join('\n')
      : '';
    return (
      `• [${item.id}] ${item.sender_name ? `${item.sender_name} · ` : ''}${item.sender}\n` +
      historyText(item) +
      `  Pesan sekarang: "${item.message || ''}"` +
      attachment +
      (instructions ? `\n${instructions}` : '')
    );
  });
  return (
    `Ada ${items.length} pesan WhatsApp baru. Balas SETIAP pesan SEKALI lewat tool kirim_wa ` +
    `dengan inbox_id pesan itu. Kalau beberapa pesan dari orang yang sama, balas satu kali gabungan ` +
    `dan tandai sisanya lewati_wa "digabung".\n\n${rows.join('\n')}`
  );
}

async function handoverSenders(service: SupabaseClient): Promise<Set<string>> {
  try {
    const { data } = await service.from('wa_handover').select('sender').eq('active', true);
    return new Set(((data ?? []) as Array<{ sender: string }>).map((row) => String(row.sender)));
  } catch {
    return new Set();
  }
}

async function startRun(service: SupabaseClient, mode: string): Promise<number | null> {
  try {
    // Run yang tidak pernah selesai (timeout/crash) ditandai supaya tidak "berjalan" selamanya.
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await service
      .from('wa_agent_runs')
      .update({ mode: 'error', error: 'run tidak selesai', note: 'timeout / terputus' })
      .eq('mode', 'running')
      .lt('created_at', staleBefore);

    const { data } = await service
      .from('wa_agent_runs')
      .insert({ mode: 'running', note: `berjalan (${mode})…` })
      .select('id')
      .single();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

async function finishRun(
  service: SupabaseClient,
  id: number | null,
  entry: {
    mode: string;
    handled?: number;
    replied?: number;
    held?: number;
    leftover?: number;
    rounds?: number;
    tools?: string[];
    duration_ms?: number;
    error?: string | null;
    note?: string | null;
    detail?: string | null;
  },
): Promise<void> {
  const payload = {
    mode: entry.mode,
    handled: entry.handled ?? 0,
    replied: entry.replied ?? 0,
    held: entry.held ?? 0,
    leftover: entry.leftover ?? 0,
    rounds: entry.rounds ?? 0,
    tools: entry.tools ?? [],
    duration_ms: entry.duration_ms ?? null,
    error: entry.error ?? null,
    note: entry.note ?? null,
    detail: entry.detail ?? null,
  };
  try {
    if (id) {
      await service.from('wa_agent_runs').update(payload).eq('id', id);
    } else {
      await service.from('wa_agent_runs').insert(payload);
    }
  } catch (error) {
    console.error('gagal simpan log run', error);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });

  if (!secretOk(req)) return json({ ok: false, error: 'Tidak berwenang.' }, 401);

  if (req.method === 'GET') {
    return json({
      ok: true,
      dry: isDry(),
      batch: batchSize(),
      base_url: Deno.env.get('SAMAQU_BASE_URL') || 'https://www.samaqu.id',
    });
  }

  const startedAt = Date.now();
  let runId: number | null = null;
  let lockedSender: string | null = null;

  try {
    const url = new URL(req.url);
    const testMode = url.searchParams.get('test') === '1';

    const service = serviceClient();
    const row = await loadSettings(service);

    // Mode bot (diatur di Pengaturan admin): "local" = lokal yang balas; "auto" =
    // server minggir selama heartbeat lokal masih segar (< 3 menit).
    const { data: botControlRow } = await service
      .from('wa_bot_control')
      .select('mode,heartbeat')
      .eq('id', 1)
      .maybeSingle();
    const botMode = String((botControlRow as { mode?: string } | null)?.mode || 'auto');
    const heartbeatMs = (botControlRow as { heartbeat?: string } | null)?.heartbeat
      ? Date.parse(String((botControlRow as { heartbeat?: string }).heartbeat))
      : 0;
    const localFresh = Number.isFinite(heartbeatMs) && Date.now() - heartbeatMs < 3 * 60 * 1000;
    // Mode "off": kill switch. Dipakai saat shift admin / bot sengaja dimatikan.
    // Pesan tetap masuk ke inbox, tapi tidak ada yang membalas otomatis.
    if (botMode === 'off') {
      return json({ ok: true, skipped: 'bot dimatikan (mode off)' });
    }
    if (botMode === 'local' || (botMode === 'auto' && localFresh)) {
      return json({ ok: true, skipped: 'local aktif' });
    }
    const behavior = mergeBehavior(row.behavior);
    const apiKey = await apiKeyFor(row);
    if (!apiKey) return json({ ok: false, error: 'API key MiMo belum diisi.' }, 503);

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const dry = (isDry() || url.searchParams.get('dry') === '1') && !testMode;
    if (!dry && !testMode && !isWaOnline()) {
      return json({ ok: true, off: true, message: 'Di luar jam kerja AI (16.30-07.30; Minggu full).' });
    }
    const ctx: ToolContext = { dry, senders: new Map(), handled: new Set(), outbox: [], service };
    const runIdLocal = await startRun(service, testMode ? 'test' : dry ? 'dry' : 'live');
    runId = runIdLocal;
    let items: any[] = [];

    if (dry || testMode) {
      const pesanRaw = String(body.pesan || '').trim();
      if (dry && !pesanRaw) {
        await finishRun(service, runId, {
          mode: 'dry',
          note: 'tanpa pesan uji',
          duration_ms: Date.now() - startedAt,
        });
        return json({
          ok: true,
          dry: true,
          note: 'Mode uji. Kirim body {pesan, pengirim} untuk mencoba balasan.',
        });
      }
      const pesan = (pesanRaw || 'Halo, saya mau tanya harga thobe dong').slice(0, 2000);
      const pengirim = String(body.pengirim || '6281234567890').replace(/\D/g, '');
      const nama = String(body.nama || 'Customer Uji');
      const mediaUrl = String(body.media_url || body.mediaUrl || '').trim();
      const id = testMode ? 'TEST' : 'DRY-TEST';
      items = [{
        id,
        sender: pengirim,
        sender_name: nama,
        message: pesan,
        media_url: mediaUrl || null,
        riwayat: [],
      }];
      // Di mode tes, inbox_id tidak didaftarkan supaya model mengirim tanpa inbox_id.
      if (dry) ctx.senders.set(id, pengirim);
    } else {
      // Lepas pesan yang tertahan "processing" lebih dari 3 menit (run sebelumnya putus).
      const staleBefore = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      await samaquPatch(
        `wa_inbox?status=eq.processing&claimed_at=lt.${encodeURIComponent(staleBefore)}`,
        { status: 'pending', claimed_at: null, updated_at: new Date().toISOString() },
      );

      // Jeda singkat; cron tetap menjadi fallback kalau trigger langsung gagal.
      await debounceNewest();

      const inbox = await opsFetch(`/api/ops/wa-inbox?limit=${batchSize()}`);
      items = Array.isArray(inbox?.items) ? inbox.items : [];
      if (items.length) {
        // Trace: id pesan (`wa_inbox.id`) yang sama dipakai sampai balasan terkirim.
        console.log(
          `[WA-TRACE] server-claim ${items.map((item: any) => String(item.id)).join(',')}`,
        );
      }
      if (!items.length) {
        await finishRun(service, runId, {
          mode: 'live',
          note: 'tidak ada pesan baru',
          duration_ms: Date.now() - startedAt,
        });
        return json({ ok: true, dry, handled: 0, note: 'Tidak ada pesan baru.' });
      }

      // Percakapan yang sudah diambil alih admin tidak dibalas bot.
      const held = await handoverSenders(service);
      const heldItems = items.filter((item) => held.has(String(item.sender || '')));
      for (const item of heldItems) {
        try {
          await opsFetch('/api/ops/wa-inbox', {
            method: 'PATCH',
            body: JSON.stringify({ id: item.id, action: 'skip', note: 'diambil alih admin' }),
          });
        } catch {
          // biarkan; run berikutnya mencoba lagi
        }
      }
      items = items.filter((item) => !held.has(String(item.sender || '')));
      if (!items.length) {
        await finishRun(service, runId, {
          mode: 'live',
          held: heldItems.length,
          note: 'semua pesan diambil alih admin',
          duration_ms: Date.now() - startedAt,
        });
        return json({
          ok: true,
          dry,
          handled: 0,
          held: heldItems.length,
          note: 'Semua pesan diambil alih admin.',
        });
      }

      // Satu run = satu percakapan. Pesan dari nomor lain dikembalikan ke antrean,
      // supaya pesan beruntun dari orang yang sama dibalas SEKALI (tidak "Siap Ka" berulang).
      const bySender = new Map<string, any[]>();
      for (const item of items) {
        const key = String(item.sender || '');
        if (!bySender.has(key)) bySender.set(key, []);
        bySender.get(key)!.push(item);
      }
      if (bySender.size > 1) {
        const ordered = [...bySender.entries()].sort((a, b) =>
          String(b[1][b[1].length - 1]?.created_at || '').localeCompare(
            String(a[1][a[1].length - 1]?.created_at || ''),
          ),
        );
        const keepSender = ordered[0][0];
        const dropIds = items
          .filter((item) => String(item.sender || '') !== keepSender)
          .map((item) => String(item.id));
        await samaquPatch(`wa_inbox?id=in.(${dropIds.join(',')})&status=eq.processing`, {
          status: 'pending',
          claimed_at: null,
          updated_at: new Date().toISOString(),
        });
        items = items.filter((item) => String(item.sender || '') === keepSender);
      }

      // Kunci per nomor: cegah chat yang sama diproses dua run bersamaan.
      const groupSender = String(items[0]?.sender || '');
      if (groupSender) {
        const locked = await acquireLock(service, groupSender, String(runId ?? ''));
        if (!locked) {
          const ids = items.map((item) => String(item.id));
          await samaquPatch(`wa_inbox?id=in.(${ids.join(',')})&status=eq.processing`, {
            status: 'pending',
            claimed_at: null,
            updated_at: new Date().toISOString(),
          });
          await finishRun(service, runId, {
            mode: 'live',
            note: 'percakapan sedang diproses run lain',
            duration_ms: Date.now() - startedAt,
          });
          return json({
            ok: true,
            dry,
            handled: 0,
            locked: true,
            note: 'Percakapan sedang diproses run lain.',
          });
        }
        lockedSender = groupSender;
      }

      for (const item of items) ctx.senders.set(String(item.id), String(item.sender || ''));
    }

    const question = items.map((item) => String(item.message || '')).join('\n').slice(0, 2000);
    ctx.adLead = looksLikeAdLead(question);
    const memory = await memoryContext(service);
    // Stok bonus dibaca ulang tiap run dari produk (bukan kuota promo), supaya bot
    // tidak pernah menawarkan cover yang sudah habis walau memory/persona tidak dibaca.
    const bonusStock = await bonusStockContext();

    const system = [
      waktuSekarangWib(),
      behavior.systemInstructions,
      memory ? `MEMORI ORGANISASI (sudah disetujui):\n${memory}` : '',
      bonusStock,
      // proof_url tidak perlu dikirim model: server mengisinya dari pesan bukti, dan
      // URL bertanda tangan yang panjang membuat markup kepotong.
      'ATURAN TEKNIS: saat memanggil catat_closing, JANGAN sertakan proof_url. Cukup nomor, nominal, inbox_id pesan bukti, nama, alamat lengkap, kecamatan, kota, provinsi, kode_pos, dan pesanan.',
      'ATURAN PRIVASI PESANAN: cek_pesanan hanya boleh dipanggil dengan nomor HP customer ini, nomor pesanan, atau nomor resi. Jangan pernah menyebut pesanan/resi yang bukan hasil pencarian nomor customer ini. Kalau belum ada nomor HP/nomor pesanan, tanya dulu — jangan menebak.',
      'ATURAN ONGKIR: saat memanggil cek_ongkir atau rekap_pesanan, kirim `items` (product_id dari cari_produk, size, quantity) untuk SEMUA barang. Berat dihitung server dari berat varian per ukuran, lalu berat produk; kalau kosong fallback 1000 g. Jangan mengirim berat_gram hasil hitungan sendiri.',
      'ALUR REKENING: sebelum mengirim nomor rekening, WAJIB panggil rekap_pesanan (items + kota + kecamatan). Kirim hasil rekap apa adanya — jangan menambah, mengurangi, atau membulatkan angka. Minta konfirmasi. Nomor rekening baru dikirim setelah customer menyetujui rekap itu. Kalau rekap berbeda dari hitungan customer, jelaskan dan tunggu persetujuan.',
      WA_AGENT_RULES,
    ]
      .filter(Boolean)
      .join('\n\n---\n\n');

    const prefix = dry
      ? 'MODE UJI (DRY RUN): jangan kirim WhatsApp, jangan tulis lead.\n\n'
      : testMode
        ? 'MODE TES KIRIM NYATA: panggil kirim_wa TANPA inbox_id.\n\n'
        : '';

    // Lampiran Fonnte (media_url) ikut dikirim sebagai image_url — bukan cuma teks.
    // URL Fonnte KEDALUWARSA (404 text/plain); mengirimnya membuat provider menolak
    // seluruh request dengan 400. Jadi periksa dulu, hanya kirim yang benar-benar gambar.
    // Sumber gambar: ARSIP R2 (`media_key` → endpoint wa-media, berlaku 7 hari) lebih dulu,
    // baru link Fonnte. Link Fonnte hanya sementara — setelah kedaluwarsa jadi 404 dan
    // provider menolak request (400). Arsip sudah dibuat webhook saat pesan masuk.
    const candidateImages: string[] = [];
    for (const item of items) {
      const hasMedia = Boolean(item.media_key) || Boolean(item.media_url);
      if (!hasMedia) continue;
      const inboxId = String(item.id || '').trim();
      if (inboxId) {
        try {
          const signed = await opsFetch(`/api/ops/wa-media?inbox_id=${encodeURIComponent(inboxId)}`);
          const signedUrl = String(signed?.url || '').trim();
          if (signedUrl) {
            candidateImages.push(signedUrl);
            continue;
          }
        } catch {
          // arsip belum ada → jatuh ke link Fonnte
        }
      }
      const direct = String(item.media_url || '').trim();
      if (direct) candidateImages.push(direct);
    }
    const uniqueImages = [...new Set(candidateImages.filter((url) => /^https?:\/\//i.test(url)))].slice(0, 3);
    const checkedImages = await Promise.all(
      uniqueImages.map(async (url) => ({ url, ok: await isFetchableImage(url) })),
    );
    const imageParts = checkedImages
      .filter((entry) => entry.ok)
      .map((entry) => ({ type: 'image_url' as const, image_url: { url: entry.url } }));
    const droppedImages = checkedImages.length - imageParts.length;
    const imageNote = droppedImages > 0
      ? 'CATATAN SISTEM: ada lampiran gambar yang gagal diunduh (mungkin kedaluwarsa). Jangan mengaku sudah melihatnya; minta customer kirim ulang kalau gambarnya perlu dibaca.\n'
      : '';

    const userText = `${prefix}${imageNote}${inboxPrompt(items)}`;
    const messages: ToolChatMessage[] = [
      { role: 'system', content: system },
      {
        role: 'user',
        content: imageParts.length
          ? [{ type: 'text' as const, text: userText }, ...imageParts]
          : userText,
      },
    ];

    const usedTools: string[] = [];
    let answer = '';
    let rounds = 0;
    /** Berapa kali panggilan tool dibaca dari markup teks (dibatasi supaya tidak loop). */
    let textFallbackRounds = 0;

    for (; rounds < MAX_ROUNDS; rounds++) {
      const startedAt = Date.now();
      const result = await mimoChatWithTools({
        apiKey,
        baseUrl: row.base_url,
        model: row.default_model,
        messages,
        tools: WA_TOOLS,
        temperature: behavior.temperature,
        // Jangan potong di 500: markup tool-call (alamat + nominal) bisa lebih panjang
        // dan dulu terpotong tepat sebelum `</tool_call>` sehingga tidak pernah dieksekusi.
        maxTokens: Math.min(behavior.maxTokens || 900, 1500),
        thinking: 'disabled',
        timeoutMs: 45_000,
        // Kalau provider tetap menolak karena gambar, ulangi sekali tanpa gambar.
        retryWithoutImages: true,
      });

      // Catat token & perkiraan biaya supaya halaman AI Performance bisa menghitung
      // biaya bulan ini dan biaya per closing.
      await logUsage(service, {
        userId: null,
        userEmail: null,
        feature: 'wa',
        model: row.default_model,
        usage: result.usage,
        status: 'success',
        latencyMs: Date.now() - startedAt,
        estimatedCost: estimateCost(result.usage, priceForModel(row.default_model) || row.pricing),
      });

      // Provider kadang mengirim panggilan tool sebagai TEKS di `content`. Jalankan
      // lewat jalur yang sama seperti tool_calls terstruktur, supaya aksinya tidak hilang.
      const viaText = result.toolCalls.length === 0;
      const calls = viaText ? parseTextToolCalls(result.content) : result.toolCalls;

      if (!calls.length) {
        // Tidak ada tool sama sekali -> ini balasan final. Teks yang berisi markup
        // tetap dibuang oleh cleanForCustomer sebelum dikirim ke customer.
        answer = result.content;
        break;
      }

      if (viaText) {
        if (textFallbackRounds >= 2) {
          // Model terus menulis markup walau sudah dieksekusi: berhenti, jangan loop.
          answer = '';
          break;
        }
        textFallbackRounds += 1;
      }

      messages.push({
        role: 'assistant',
        // Markup teks tidak diumpan balik ke model supaya tidak meniru formatnya.
        content: viaText ? null : result.content || null,
        tool_calls: calls,
      });

      for (const call of calls) {
        usedTools.push(call.function.name);
        const executed = await executeTool(call.function.name, call.function.arguments, ctx);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: executed.text,
        });
      }
    }

    // Pesan lain dari pengirim yang sama (sudah dibalas satu kali) ditandai digabung,
    // supaya tidak dibalas lagi di run berikutnya.
    const handledSenders = new Set(
      items
        .filter((item) => ctx.handled.has(String(item.id)))
        .map((item) => String(item.sender || '')),
    );
    const extras = items.filter(
      (item) => !ctx.handled.has(String(item.id)) && handledSenders.has(String(item.sender || '')),
    );
    for (const item of extras) {
      try {
        await opsFetch('/api/ops/wa-inbox', {
          method: 'PATCH',
          body: JSON.stringify({ id: item.id, action: 'skip', note: 'digabung' }),
        });
        ctx.handled.add(String(item.id));
      } catch {
        // coba lagi run berikutnya
      }
    }

    // Pengaman: model sudah menyusun balasan tapi TIDAK memanggil kirim_wa sama sekali.
    // Hanya jalan kalau belum ada satu pun balasan terkirim di run ini.
    const outgoing = cleanForCustomer(answer);
    if (outgoing && ctx.outbox.length === 0) {
      const unanswered = items.filter((item) => !ctx.handled.has(String(item.id)));
      if (unanswered.length >= 1) {
        const item = unanswered[0];
        if (ctx.dry) {
          ctx.outbox.push({ nomor: String(item.sender || ''), pesan: outgoing, inbox_id: String(item.id) });
          ctx.handled.add(String(item.id));
        } else {
          try {
            await opsFetch('/api/ops/wa-inbox', {
              method: 'POST',
              body: JSON.stringify({
                target: String(item.sender || ''),
                message: outgoing,
                inbox_id: String(item.id),
              }),
            });
            ctx.handled.add(String(item.id));
            ctx.outbox.push({ nomor: String(item.sender || ''), pesan: outgoing, inbox_id: String(item.id) });
          } catch (error) {
            console.error('gagal kirim otomatis', error);
          }
        }

        for (const rest of unanswered.slice(1)) {
          if (ctx.dry) {
            ctx.handled.add(String(rest.id));
            continue;
          }
          try {
            await opsFetch('/api/ops/wa-inbox', {
              method: 'PATCH',
              body: JSON.stringify({ id: rest.id, action: 'skip', note: 'digabung' }),
            });
            ctx.handled.add(String(rest.id));
          } catch {
            // biarkan; run berikutnya
          }
        }
      }
    }

    const replied = [...ctx.handled].length;
    const leftover = items.filter((item) => !ctx.handled.has(String(item.id))).map((item) => item.id);

    // Kembalikan pesan yang belum sempat dibalas ke antrean (jangan biarkan "processing").
    if (leftover.length && !dry) {
      await samaquPatch(`wa_inbox?id=in.(${leftover.join(',')})&status=eq.processing`, {
        status: 'pending',
        claimed_at: null,
        updated_at: new Date().toISOString(),
      });
    }
    const toolNames = [...new Set(usedTools)];

    const detailParts: string[] = [];
    if (ctx.outbox.length) {
      detailParts.push(
        'BALASAN TERKIRIM:\n' +
          ctx.outbox
            .map((item) => `• ke ${item.nomor}${item.inbox_id ? ` [${item.inbox_id}]` : ''}\n${item.pesan}`)
            .join('\n\n'),
      );
    }
    if (answer) detailParts.push(`CATATAN MODEL:\n${answer}`);
    if (toolNames.length) detailParts.push(`TOOL: ${toolNames.join(', ')}`);
    if (leftover.length) detailParts.push(`BELUM TERJAWAB: ${leftover.join(', ')}`);
    const detail = detailParts.join('\n\n').slice(0, 6000);

    await finishRun(service, runId, {
      mode: testMode ? 'test' : dry ? 'dry' : 'live',
      handled: items.length,
      replied,
      leftover: leftover.length,
      rounds,
      tools: toolNames,
      duration_ms: Date.now() - startedAt,
      note: answer ? answer.slice(0, 500) : null,
      detail,
    });

    if (lockedSender) {
      await releaseLock(service, lockedSender);
      lockedSender = null;
    }

    return json({
      ok: true,
      dry,
      test: testMode,
      adLead: ctx.adLead ?? false,
      handled: items.length,
      replied,
      rounds,
      tools: toolNames,
      outbox: ctx.outbox,
      answer: dry ? answer : undefined,
      leftover,
    });
  } catch (error) {
    const message = errorMessage(error);
    console.error('wa-agent error', message);
    try {
      if (lockedSender) await releaseLock(serviceClient(), lockedSender);
    } catch {
      // abaikan
    }
    try {
      await finishRun(serviceClient(), runId, {
        mode: 'error',
        error: message.slice(0, 500),
        duration_ms: Date.now() - startedAt,
      });
    } catch {
      // jangan sampai logging menggagalkan respons
    }
    return json({ ok: false, error: message }, 500);
  }
});
