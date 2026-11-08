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
import { isWaOnline } from '../_shared/wa/schedule.mjs';

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

    const system = [
      behavior.systemInstructions,
      memory ? `MEMORI ORGANISASI (sudah disetujui):\n${memory}` : '',
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
    const imageParts = items
      .map((item) => String(item.media_url || '').trim())
      .filter((url) => /^https?:\/\//i.test(url))
      .slice(0, 3)
      .map((url) => ({ type: 'image_url' as const, image_url: { url } }));

    const userText = `${prefix}${inboxPrompt(items)}`;
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

    for (; rounds < MAX_ROUNDS; rounds++) {
      const startedAt = Date.now();
      const result = await mimoChatWithTools({
        apiKey,
        baseUrl: row.base_url,
        model: row.default_model,
        messages,
        tools: WA_TOOLS,
        temperature: behavior.temperature,
        maxTokens: Math.min(behavior.maxTokens || 500, 500),
        thinking: 'disabled',
        timeoutMs: 45_000,
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

      if (!result.toolCalls.length) {
        answer = result.content;
        break;
      }

      messages.push({
        role: 'assistant',
        content: result.content || null,
        tool_calls: result.toolCalls as MimoToolCall[],
      });

      for (const call of result.toolCalls) {
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
