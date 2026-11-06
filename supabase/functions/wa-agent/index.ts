import { errorMessage, json, serviceClient } from '../_shared/http.ts';
import { apiKeyFor, loadSettings } from '../_shared/settings.ts';
import { mergeBehavior } from '../_shared/prompts.ts';
import { WA_AGENT_RULES } from '../_shared/prompts.ts';
import {
  mimoChatWithTools,
  type MimoToolCall,
  type ToolChatMessage,
} from '../_shared/mimo-tools.ts';
import { rankDocs } from '../_shared/knowledge-ranking.ts';
import { toMemoryDoc, type MemoryRow } from '../_shared/knowledge-documents.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { executeTool, opsFetch, WA_TOOLS, type ToolContext } from './tools.ts';

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

const MAX_ROUNDS = 4;

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

function secretOk(req: Request): boolean {
  const expected = Deno.env.get('WA_AGENT_SECRET') || '';
  if (!expected) return false;
  const url = new URL(req.url);
  const given = req.headers.get('x-wa-secret') || url.searchParams.get('key') || '';
  return given === expected;
}

function isDry(): boolean {
  return (Deno.env.get('WA_AGENT_DRY') ?? '1') !== '0';
}

function batchSize(): number {
  const value = Number(Deno.env.get('WA_AGENT_BATCH') || 3);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1), 5) : 3;
}

async function memoryContext(service: SupabaseClient, question: string): Promise<string> {
  const { data, error } = await service
    .from('memory_items')
    .select('id,title,category,content,source,version,updated_at')
    .eq('status', 'published')
    .order('updated_at', { ascending: false })
    .limit(300);
  if (error) return '';
  const docs = ((data ?? []) as MemoryRow[]).map(toMemoryDoc);
  const ranked = rankDocs(docs, question, 3);
  if (!ranked.length) return '';
  return ranked
    .map(({ doc }) => `[M] ${doc.title} | Kategori: ${doc.category}\n${doc.content}`)
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
    return (
      `• [${item.id}] ${item.sender_name ? `${item.sender_name} · ` : ''}${item.sender}\n` +
      historyText(item) +
      `  Pesan sekarang: "${item.message || ''}"`
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

  try {
    const url = new URL(req.url);
    const testMode = url.searchParams.get('test') === '1';

    const service = serviceClient();
    const row = await loadSettings(service);
    const behavior = mergeBehavior(row.behavior);
    const apiKey = await apiKeyFor(row);
    if (!apiKey) return json({ ok: false, error: 'API key MiMo belum diisi.' }, 503);

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const dry = isDry() && !testMode;
    const ctx: ToolContext = { dry, senders: new Map(), handled: new Set(), outbox: [] };
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
      const id = testMode ? 'TEST' : 'DRY-TEST';
      items = [{ id, sender: pengirim, sender_name: nama, message: pesan, riwayat: [] }];
      // Di mode tes, inbox_id tidak didaftarkan supaya model mengirim tanpa inbox_id.
      if (dry) ctx.senders.set(id, pengirim);
    } else {
      // Lepas pesan yang tertahan "processing" lebih dari 3 menit (run sebelumnya putus).
      const staleBefore = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      await samaquPatch(
        `wa_inbox?status=eq.processing&claimed_at=lt.${encodeURIComponent(staleBefore)}`,
        { status: 'pending', claimed_at: null, updated_at: new Date().toISOString() },
      );

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

      for (const item of items) ctx.senders.set(String(item.id), String(item.sender || ''));
    }

    const question = items.map((item) => String(item.message || '')).join('\n').slice(0, 2000);
    const memory = await memoryContext(service, question);

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

    const messages: ToolChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: `${prefix}${inboxPrompt(items)}` },
    ];

    const usedTools: string[] = [];
    let answer = '';
    let rounds = 0;

    for (; rounds < MAX_ROUNDS; rounds++) {
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
    if (answer && !/^laporan\s*:/i.test(answer.trim()) && ctx.outbox.length === 0) {
      const unanswered = items.filter((item) => !ctx.handled.has(String(item.id)));
      if (unanswered.length >= 1) {
        const item = unanswered[0];
        if (ctx.dry) {
          ctx.outbox.push({ nomor: String(item.sender || ''), pesan: answer, inbox_id: String(item.id) });
          ctx.handled.add(String(item.id));
        } else {
          try {
            await opsFetch('/api/ops/wa-inbox', {
              method: 'POST',
              body: JSON.stringify({
                target: String(item.sender || ''),
                message: answer,
                inbox_id: String(item.id),
              }),
            });
            ctx.handled.add(String(item.id));
            ctx.outbox.push({ nomor: String(item.sender || ''), pesan: answer, inbox_id: String(item.id) });
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

    return json({
      ok: true,
      dry,
      test: testMode,
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
