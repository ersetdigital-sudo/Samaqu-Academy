import { errorMessage, json, requireUser, serviceClient } from '../_shared/http.ts';

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
}

async function conversations() {
  const [rows, handovers] = await Promise.all([
    serviceFetch(
      'wa_inbox?select=id,sender,sender_name,message,status,created_at,replied_at,reply_text,error&order=created_at.desc&limit=600',
    ),
    handoverSet(),
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
  return {
    items: [...map.values()].sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt))),
    stats: summary,
  };
}

async function messages(sender: string, limit = 100) {
  if (!sender) throw new Error('Nomor pengirim kosong.');
  const rows = await serviceFetch(
    `wa_inbox?select=id,sender,sender_name,message,status,created_at,replied_at,reply_text&sender=eq.${encodeURIComponent(sender)}&order=created_at.desc&limit=${limit}`,
  );
  return (Array.isArray(rows) ? rows : []).reverse();
}

async function stats() {
  const rows = await serviceFetch('wa_inbox?select=status,created_at&limit=1000');
  const list = Array.isArray(rows) ? rows : [];
  const pending = list.filter((r) => r.status === 'pending').length;
  const processing = list.filter((r) => r.status === 'processing').length;
  const sent = list.filter((r) => r.status === 'sent').length;
  const skipped = list.filter((r) => r.status === 'skipped').length;
  return { pending, processing, sent, skipped, total: list.length };
}

async function runs(limit = 50) {
  const { data, error } = await serviceClient()
    .from('wa_agent_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function reply(sender: string, message: string, by: string | null) {
  const target = norm(sender);
  const text = String(message || '').trim();
  if (!target || !text) throw new Error('Nomor dan pesan wajib diisi.');

  const sent = await opsPost('/api/ops/wa-inbox', { target, message: text });

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

  return { target: sent?.target || target };
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
      return json({ ok: true, items: await runs(Math.min(Math.max(Number(body.limit) || 50, 1), 200)) });
    }
    return json({ ok: false, error: 'Aksi tidak dikenal.' }, 400);
  } catch (error) {
    const message = errorMessage(error);
    console.error('wa-admin error', message);
    return json({ ok: false, error: message }, 500);
  }
});
