import { errorMessage, isOwner, json, requireUser, serviceClient } from '../_shared/http.ts';
import { analyze, summarizeToolCalls, type EscalationRow, type LearningRow } from '../_shared/lessons-analysis.ts';
import * as lessons from '../_shared/lessons-actions.ts';
import * as escalations from '../_shared/escalations.ts';
import { mimoChat } from '../_shared/mimo.ts';
import { apiKeyFor, estimateCost, loadSettings, logUsage, priceForModel } from '../_shared/settings.ts';

/**
 * API CRM WhatsApp untuk halaman /wa di Academy (khusus user login).
 *
 * Sumber data: Supabase SAMAQU (project terpisah) lewat REST service-role.
 * Kirim pesan: API /api/ops/wa-inbox SAMAQU (login admin) supaya aturan rate-limit
 * dan jalur Fonnte tetap sama dengan bot.
 *
 *   conversations → daftar percakapan (dikelompokkan per nomor)
 *   messages      → riwayat pesan satu nomor
 *   reply         → kirim balasan manual + tandai pesan pending "dibalas manual"
 *   stats         → ringkasan antrean
 */

const SAMAQU_URL = (Deno.env.get('SAMAQU_BASE_URL') || 'https://www.samaqu.id').replace(/\/+$/, '');
const SUPA_URL = Deno.env.get('SAMAQU_SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SAMAQU_SERVICE_ROLE_KEY') || '';
const ANON_KEY = Deno.env.get('SAMAQU_SUPABASE_ANON_KEY') || '';
const ADMIN_EMAIL = Deno.env.get('SAMAQU_ADMIN_EMAIL') || '';
const ADMIN_PASSWORD = Deno.env.get('SAMAQU_ADMIN_PASSWORD') || '';

let session: { token: string; expiresAt: number } | null = null;

async function serviceFetch(pathname: string, init: RequestInit = {}): Promise<any> {
  if (!SUPA_URL || !SERVICE_KEY) throw new Error('SAMAQU_SUPABASE_URL / SAMAQU_SERVICE_ROLE_KEY belum diisi.');
  const res = await fetch(`${SUPA_URL}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.message || body?.error || `Supabase ${res.status}`);
  return body;
}

async function adminToken(): Promise<string> {
  if (session && session.expiresAt > Date.now()) return session.token;
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.access_token) throw new Error('Login admin SAMAQU gagal.');
  session = {
    token: String(body.access_token),
    expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000 - 60_000,
  };
  return session.token;
}

async function opsPost(pathname: string, payload: unknown): Promise<any> {
  const token = await adminToken();
  const res = await fetch(`${SAMAQU_URL}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Permintaan gagal (HTTP ${res.status})`);
  return body;
}

function norm(raw: unknown): string {
  return String(raw || '').replace(/\D/g, '');
}

async function handoverSet(): Promise<Set<string>> {
  try {
    const { data } = await serviceClient().from('wa_handover').select('sender').eq('active', true);
    return new Set(((data ?? []) as Array<{ sender: string }>).map((row) => String(row.sender)));
  } catch {
    return new Set();
  }
}

async function setHandover(sender: string, active: boolean, by: string | null) {
  const now = new Date().toISOString();
  const { error } = await serviceClient().from('wa_handover').upsert(
    {
      sender,
      active,
      taken_over_by: by,
      taken_over_at: now,
      released_at: active ? null : now,
    },
    { onConflict: 'sender' },
  );
  if (error) throw new Error(error.message);

  // Catat di Log Bot supaya aksi ambil alih / kembalikan terlihat.
  try {
    await serviceClient().from('wa_agent_runs').insert({
      mode: active ? 'takeover' : 'release',
      handled: 0,
      replied: 0,
      held: 0,
      leftover: 0,
      rounds: 0,
      tools: [],
      duration_ms: 0,
      error: null,
      note: active ? `diambil alih admin: ${sender}` : `dikembalikan ke bot: ${sender}`,
      detail: by ? `oleh ${by}` : null,
    });
  } catch (e) {
    console.error('gagal menulis log handover', e);
  }

  // Tutup pesan yang masih pending/processing di SAMAQU. Ini menutup celah bot yang
  // sudah terlanjur klaim sebelum admin klik "Ambil alih".
  if (active) {
    await serviceFetch(
      `wa_inbox?sender=eq.${encodeURIComponent(sender)}&status=in.(pending,processing)`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'skipped',
          error: 'diambil alih admin',
          claimed_at: null,
          updated_at: now,
        }),
      },
    );
  }
}

type PendingEntry = { count: number; pendingCount: number; oldestAt: string; name: string; message: string };

/**
 * Pesan yang benar-benar belum dibalas (pending/processing) per nomor, TIDAK terbatas pada 600 baris
 * terbaru. Dipakai untuk hitungan "belum dibalas" dan lama menunggu. Kalau gagal dibaca, hasilnya null
 * dan pemanggil memakai hitungan lama (dari 600 baris terbaru) tanpa lama menunggu.
 */
async function pendingBySender(): Promise<Map<string, PendingEntry> | null> {
  try {
    const rows = await serviceFetch(
      'wa_inbox?select=sender,sender_name,message,created_at,status&status=in.(pending,processing)&order=created_at.asc&limit=1000',
    );
    const map = new Map<string, PendingEntry>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const sender = String(row.sender || '');
      if (!sender) continue;
      let entry = map.get(sender);
      if (!entry) {
        entry = {
          count: 0,
          pendingCount: 0,
          oldestAt: String(row.created_at || ''),
          name: row.sender_name || '',
          message: row.message || '',
        };
        map.set(sender, entry);
      }
      entry.count += 1;
      if (row.status === 'pending') entry.pendingCount += 1;
      if (!entry.name && row.sender_name) entry.name = row.sender_name;
    }
    return map;
  } catch (e) {
    console.error('gagal membaca antrean belum dibalas', errorMessage(e));
    return null;
  }
}

async function conversations() {
  const [rows, handovers, pend] = await Promise.all([
    serviceFetch(
      'wa_inbox?select=id,sender,sender_name,message,status,created_at,replied_at,reply_text,error&order=created_at.desc&limit=600',
    ),
    handoverSet(),
    pendingBySender(),
  ]);
  const map = new Map<string, any>();
  const summary = { pending: 0, processing: 0, sent: 0, skipped: 0, total: 0 };
  for (const row of Array.isArray(rows) ? rows : []) {
    const sender = String(row.sender || '');
    if (!sender) continue;
    summary.total += 1;
    if (row.status === 'pending') summary.pending += 1;
    else if (row.status === 'processing') summary.processing += 1;
    else if (row.status === 'sent') summary.sent += 1;
    else if (row.status === 'skipped') summary.skipped += 1;
    let entry = map.get(sender);
    if (!entry) {
      entry = {
        sender,
        name: row.sender_name || '',
        lastMessage: row.message || '',
        lastAt: row.created_at,
        lastStatus: row.status,
        pending: 0,
        sent: 0,
        total: 0,
        handover: handovers.has(sender),
      };
      map.set(sender, entry);
    }
    entry.total += 1;
    if (row.status === 'pending' || row.status === 'processing') entry.pending += 1;
    if (row.status === 'sent') entry.sent += 1;
    if (!entry.name && row.sender_name) entry.name = row.sender_name;
  }

  // Antrean belum dibalas yang akurat + lama menunggu (pesan tertua yang belum dibalas).
  if (pend) {
    for (const entry of map.values()) {
      const p = pend.get(entry.sender);
      entry.pending = p ? p.count : 0;
      entry.oldestPendingAt = p ? p.oldestAt : null;
    }
    // Nomor yang menunggu tapi tidak masuk 600 baris terbaru tetap harus muncul di daftar.
    for (const [sender, p] of pend) {
      if (map.has(sender)) continue;
      map.set(sender, {
        sender,
        name: p.name,
        lastMessage: p.message,
        lastAt: p.oldestAt,
        lastStatus: 'pending',
        pending: p.count,
        sent: 0,
        total: p.count,
        handover: handovers.has(sender),
        oldestPendingAt: p.oldestAt,
      });
    }
    let pendingRows = 0;
    let processingRows = 0;
    for (const p of pend.values()) {
      pendingRows += p.pendingCount;
      processingRows += p.count - p.pendingCount;
    }
    summary.pending = pendingRows;
    summary.processing = processingRows;
  }

  return {
    items: [...map.values()].sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt))),
    stats: summary,
  };
}

async function messages(sender: string, limit = 100) {
  if (!sender) throw new Error('Nomor pengirim kosong.');
  const rows = await serviceFetch(
    `wa_inbox?select=*&sender=eq.${encodeURIComponent(sender)}&order=created_at.desc&limit=${limit}`,
  );
  const list = (Array.isArray(rows) ? rows : []).reverse() as Record<string, unknown>[];
  const ids = list.map((row) => String(row.id || '')).filter(Boolean);
  if (!ids.length) return list;

  // Siapa yang mengklaim/membalas pesan ini (local/server), dicatat saat klaim.
  // Tabel `wa_handled` ada di database ACADEMY, bukan di database Samaqu.
  let handled = new Map<string, string>();
  try {
    const { data: marks } = await serviceClient()
      .from('wa_handled')
      .select('inbox_id,source')
      .in('inbox_id', ids);
    handled = new Map(
      (marks || []).map((row: { inbox_id: string; source: string }) => [
        String(row.inbox_id),
        String(row.source),
      ]),
    );
  } catch {
    handled = new Map();
  }

  return list.map((row) => ({
    ...row,
    handled_by: handled.get(String(row.id || '')) || null,
  }));
}

async function stats() {
  const rows = await serviceFetch('wa_inbox?select=status,created_at&limit=1000');
  const list = Array.isArray(rows) ? rows : [];
  let pending = list.filter((r) => r.status === 'pending').length;
  let processing = list.filter((r) => r.status === 'processing').length;
  // Hitungan belum dibalas yang akurat (daftar di atas hanya 1000 baris tanpa urutan).
  const pend = await pendingBySender();
  if (pend) {
    pending = 0;
    processing = 0;
    for (const p of pend.values()) {
      pending += p.pendingCount;
      processing += p.count - p.pendingCount;
    }
  }
  const sent = list.filter((r) => r.status === 'sent').length;
  const skipped = list.filter((r) => r.status === 'skipped').length;
  return { pending, processing, sent, skipped, total: list.length };
}

/**
 * Daftar run bot. `compact` menyembunyikan run kosong (cron tiap menit tanpa pesan baru atau bentrok
 * dengan run lain: ±70% isi tabel) supaya run yang penting tidak tertimbun; jumlah run kosong pada
 * rentang yang sama dikembalikan terpisah. Mode lama (tanpa `compact`) tidak berubah.
 */
async function runs(limit = 50, compact = false) {
  const client = serviceClient();
  let query = client.from('wa_agent_runs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (compact) {
    query = query.or('handled.gt.0,held.gt.0,error.not.is.null,mode.neq.live,note.ilike.jaring pengaman*');
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const items = data ?? [];
  if (!compact) return { items, idle: null };

  const since = items.length
    ? String(items[items.length - 1].created_at)
    : new Date(Date.now() - 24 * 3600e3).toISOString();
  const { count } = await client
    .from('wa_agent_runs')
    .select('id', { count: 'exact', head: true })
    .eq('mode', 'live')
    .eq('handled', 0)
    .eq('held', 0)
    .is('error', null)
    .or('note.is.null,note.not.ilike.jaring pengaman*')
    .gte('created_at', since);
  return { items, idle: { count: count ?? 0, since } };
}

/**
 * Tab "Pelajaran AI" (Fase 1, BACA SAJA): ringkasan eskalasi + pelajaran dari database SAMAQU dan rekam
 * jejak tool dari database Academy. Tidak menulis apa pun dan tidak memanggil AI. Pengelompokan memakai
 * kata kunci (lihat _shared/lessons-analysis.ts), jadi hasilnya perkiraan kasar untuk melihat pola.
 */
async function lessonsOverview() {
  const [escalations, learnings] = await Promise.all([
    serviceFetch(
      'wa_escalations?select=id,inbox_id,sender,sender_name,reason,summary,customer_message,status,created_at&order=created_at.desc&limit=1000',
    ),
    serviceFetch('wa_learnings?select=id,scope,sender,topic,instruction,status,created_at&order=created_at.desc&limit=500'),
  ]);
  const overview = analyze(
    Array.isArray(escalations) ? (escalations as EscalationRow[]) : [],
    Array.isArray(learnings) ? (learnings as LearningRow[]) : [],
  );

  // Rekam jejak tool 7 hari terakhir (database Academy). Opsional: kalau gagal, bagian ini kosong dan
  // tab tetap tampil.
  const since = new Date(Date.now() - 7 * 24 * 3600e3).toISOString();
  const trace = { since, ready: false, total: 0, errors: 0, tools: [] as ReturnType<typeof summarizeToolCalls>['tools'], runsWithInbox: 0 };
  try {
    const client = serviceClient();
    const [calls, linked] = await Promise.all([
      client.from('wa_tool_calls').select('tool_name,status,duration_ms').gte('created_at', since).limit(5000),
      client
        .from('wa_agent_runs')
        .select('id', { count: 'exact', head: true })
        .not('inbox_ids', 'is', null)
        .gte('created_at', since),
    ]);
    if (!calls.error) {
      const summary = summarizeToolCalls((calls.data ?? []) as Array<{ tool_name: string; status: string; duration_ms: number | null }>);
      trace.ready = true;
      trace.total = summary.total;
      trace.errors = summary.errors;
      trace.tools = summary.tools;
    }
    if (!linked.error) trace.runsWithInbox = linked.count ?? 0;
  } catch (error) {
    console.error('lessons trace error', errorMessage(error));
  }
  return { overview, trace };
}

/**
 * Pelajaran AI Fase 2: pasang database dan model asli untuk aksi usulan (_shared/lessons-actions.ts).
 * Biaya AI dicatat sebagai `admin_test` (aksi AI yang dipicu admin), BUKAN `wa`, supaya angka biaya per
 * closing di AI Performance yang dihitung dari balasan customer tidak tercemar.
 */
function lessonsDeps(user: { id: string; email?: string | null }): lessons.LessonsDeps {
  return {
    academy: serviceClient(),
    samaqu: serviceFetch,
    model: async (messages) => {
      const service = serviceClient();
      const row = await loadSettings(service);
      const apiKey = await apiKeyFor(row);
      if (!apiKey) throw new lessons.LessonsError('API key MiMo belum diisi di pengaturan AI.', 503);
      const started = Date.now();
      const entry = { userId: user.id, userEmail: user.email ?? null, feature: 'admin_test' as const, model: row.default_model };
      const ask = (maxTokens: number) =>
        mimoChat({
          apiKey,
          baseUrl: row.base_url,
          model: row.default_model,
          messages,
          temperature: 0.2,
          maxTokens,
          thinking: 'disabled',
          timeoutMs: 60_000,
        });
      try {
        // Model kadang menghabiskan seluruh jatah token tanpa isi (selesai: length). Ulangi SEKALI dengan jatah lebih besar.
        let result;
        try {
          result = await ask(2500);
        } catch (first) {
          if (!/terpotong|kosong/i.test(errorMessage(first))) throw first;
          result = await ask(4500);
        }
        await logUsage(service, {
          ...entry,
          usage: result.usage,
          status: 'success',
          latencyMs: Date.now() - started,
          estimatedCost: estimateCost(result.usage, priceForModel(row.default_model) || row.pricing),
        });
        return {
          content: result.content,
          model: result.model,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
        };
      } catch (error) {
        await logUsage(service, { ...entry, status: 'error', error: errorMessage(error), latencyMs: Date.now() - started });
        if (/terpotong|kosong/i.test(errorMessage(error))) {
          throw new lessons.LessonsError('AI belum berhasil menyusun usulan (jawabannya terpotong). Klik sekali lagi.', 502);
        }
        throw error;
      }
    },
    log: (message) => console.error('lessons', message),
  };
}

async function reply(sender: string, message: string, by: string | null) {
  const target = norm(sender);
  const text = String(message || '').trim();
  if (!target || !text) throw new Error('Nomor dan pesan wajib diisi.');

  const sent = await opsPost('/api/ops/wa-inbox', { target, message: text });

  // Catat siapa yang mengetik balasan ini (dasar waktu balas pertama & review per admin).
  // Pesan sudah terkirim, jadi kegagalan mencatat TIDAK boleh menggagalkan balasan: cukup dilog.
  try {
    await serviceFetch('wa_admin_replies', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        sender,
        admin_email: by || 'tidak diketahui',
        message: text,
        sent_at: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error('catat balasan admin gagal', errorMessage(error));
  }

  // Tandai pesan masuk yang masih pending sebagai sudah dibalas manual,
  // supaya bot tidak membalas dobel.
  const now = new Date().toISOString();
  await serviceFetch(`wa_inbox?sender=eq.${encodeURIComponent(sender)}&status=eq.pending`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'sent',
      replied_at: now,
      reply_text: text,
      error: 'dibalas manual',
      updated_at: now,
    }),
  });

  // Balas manual = admin mengambil alih percakapan ini.
  await setHandover(sender, true, by);

  // Pertanyaan AI customer ini dianggap terjawab. Pesan sudah terkirim, jadi kegagalan di sini TIDAK boleh
  // membuat balasan terlihat gagal: cukup dicatat, dan eskalasi tetap bisa ditutup manual.
  let answered = 0;
  try {
    answered = await escalations.markAnswered({ samaqu: serviceFetch }, sender, text);
  } catch (error) {
    console.error('tandai eskalasi terjawab gagal', errorMessage(error));
  }

  return { target: sent?.target || target, answered };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });

  const auth = await requireUser(req);
  if (!auth) return json({ ok: false, error: 'Sesi tidak valid. Login ulang.' }, 401);

  if (req.method === 'GET') return json({ ok: true });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Permintaan tidak valid.' }, 400);
  }

  const action = String(body.action ?? '');
  try {
    if (action === 'conversations') {
      return json({ ok: true, ...(await conversations()) });
    }
    if (action === 'messages') {
      return json({ ok: true, items: await messages(String(body.sender ?? ''), Number(body.limit) || 100) });
    }
    if (action === 'reply') {
      return json({
        ok: true,
        ...(await reply(String(body.sender ?? ''), String(body.message ?? ''), auth.user.email ?? null)),
      });
    }
    if (action === 'escalations') {
      return json({ ok: true, items: await escalations.pendingFor({ samaqu: serviceFetch }, String(body.sender ?? '')) });
    }
    if (action === 'escalation_customers') {
      return json({ ok: true, items: await escalations.waitingCustomers({ samaqu: serviceFetch }) });
    }
    if (action === 'escalation_close') {
      await escalations.closeEscalation({ samaqu: serviceFetch }, String(body.id ?? ''));
      return json({ ok: true });
    }
    if (action === 'takeover') {
      const sender = String(body.sender ?? '');
      if (!sender) throw new Error('Nomor pengirim kosong.');
      await setHandover(sender, true, auth.user.email ?? null);
      return json({ ok: true });
    }
    if (action === 'release') {
      const sender = String(body.sender ?? '');
      if (!sender) throw new Error('Nomor pengirim kosong.');
      await setHandover(sender, false, auth.user.email ?? null);
      return json({ ok: true });
    }
    if (action === 'stats') {
      return json({ ok: true, stats: await stats() });
    }
    if (action === 'logs') {
      const result = await runs(Math.min(Math.max(Number(body.limit) || 50, 1), 200), body.compact === true);
      return json({ ok: true, items: result.items, idle: result.idle });
    }
    if (action === 'lessons') {
      return json({ ok: true, ...(await lessonsOverview()) });
    }
    if (action.startsWith('lessons_')) {
      // Daftar boleh dilihat semua user login; semua aksi yang mengubah sesuatu hanya owner (dicek di lessons-actions).
      const deps = lessonsDeps(auth.user);
      const actor = { email: auth.user.email ?? null, isOwner: isOwner(auth.user) };
      const text = (key: string) => (typeof body[key] === 'string' ? (body[key] as string) : undefined);
      try {
        if (action === 'lessons_proposals') return json({ ok: true, ...(await lessons.listProposals(deps)) });
        if (action === 'lessons_generate') {
          return json({ ok: true, ...(await lessons.generate(deps, actor, { groupKey: text('group_key'), learningId: text('learning_id') })) });
        }
        if (action === 'lessons_edit') {
          return json({ ok: true, proposal: await lessons.edit(deps, actor, { id: String(body.id ?? ''), lessonText: text('lesson_text'), title: text('title') }) });
        }
        if (action === 'lessons_reject') {
          return json({ ok: true, proposal: await lessons.reject(deps, actor, { id: String(body.id ?? ''), reason: text('reason') }) });
        }
        if (action === 'lessons_publish') {
          return json({
            ok: true,
            ...(await lessons.publish(deps, actor, { id: String(body.id ?? ''), lessonText: text('lesson_text'), confirmSoft: body.confirm_soft === true })),
          });
        }
        if (action === 'lessons_retire') {
          return json({ ok: true, ...(await lessons.retire(deps, actor, { learningId: String(body.learning_id ?? '') })) });
        }
      } catch (error) {
        if (error instanceof lessons.LessonsError) {
          return json({ ok: false, error: error.message, code: error.code, ...(error.extra ?? {}) }, error.status);
        }
        throw error;
      }
    }
    return json({ ok: false, error: 'Aksi tidak dikenal.' }, 400);
  } catch (error) {
    const message = errorMessage(error);
    console.error('wa-admin error', message);
    return json({ ok: false, error: message }, 500);
  }
});
