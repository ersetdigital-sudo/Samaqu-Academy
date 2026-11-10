import { errorMessage, isOwner, json, requireUser, serviceClient } from '../_shared/http.ts';

/**
 * Kelola akun Academy (khusus Owner).
 *
 * Tidak ada API route di app karena Academy di-export statis; semua aksi
 * auth.admin dijalankan di sini memakai service role. Setiap request wajib
 * JWT user yang app_metadata.role-nya "owner".
 *
 *   list        → daftar user + profil + role
 *   create      → tambah user (allowlist + auth user + profil)
 *   set_role    → ubah role owner/cs (tidak boleh menurunkan owner terakhir)
 *   set_active  → aktif/nonaktifkan akun (ban/unban)
 */

type Role = 'owner' | 'cs';

function normRole(value: unknown): Role | null {
  return value === 'owner' || value === 'cs' ? value : null;
}

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes))
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 16);
}

async function listAllUsers(admin: ReturnType<typeof serviceClient>) {
  const users: any[] = [];
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < 200) break;
  }
  return users;
}

async function handleList() {
  const admin = serviceClient();
  const users = await listAllUsers(admin);
  const ids = users.map((user) => user.id);

  const [{ data: profiles }, { data: allowed }] = await Promise.all([
    ids.length
      ? admin.from('profiles').select('id,full_name,role').in('id', ids)
      : Promise.resolve({ data: [] as any[] }),
    admin.from('allowed_emails').select('email,role'),
  ]);

  const profileById = new Map((profiles ?? []).map((row: any) => [String(row.id), row]));
  const allowedByEmail = new Map(
    (allowed ?? []).map((row: any) => [String(row.email || '').toLowerCase(), row]),
  );

  const items = users.map((user) => {
    const profile = profileById.get(String(user.id));
    const allowedRow = allowedByEmail.get(String(user.email || '').toLowerCase());
    const role = normRole(profile?.role) ?? normRole(allowedRow?.role) ?? normRole(user.app_metadata?.role) ?? 'cs';
    const bannedUntil = user.banned_until ? Date.parse(user.banned_until) : 0;
    return {
      id: user.id,
      email: user.email ?? '',
      fullName:
        profile?.full_name ||
        user.user_metadata?.full_name ||
        String(user.email || '').split('@')[0],
      role,
      active: !(Number.isFinite(bannedUntil) && bannedUntil > Date.now()),
      createdAt: user.created_at ?? null,
      lastSignInAt: user.last_sign_in_at ?? null,
    };
  });

  items.sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
  return { items };
}

async function handleCreate(body: Record<string, unknown>) {
  const admin = serviceClient();
  const email = String(body.email ?? '').trim().toLowerCase();
  const fullName = String(body.fullName ?? '').trim();
  const role = normRole(body.role) ?? 'cs';
  const providedPassword = String(body.password ?? '').trim();
  const password = providedPassword || randomPassword();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Email tidak valid.');
  if (password.length < 8) throw new Error('Password minimal 8 karakter.');

  const { error: allowError } = await admin
    .from('allowed_emails')
    .upsert({ email, role }, { onConflict: 'email' });
  if (allowError) throw new Error(allowError.message);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { full_name: fullName || email.split('@')[0] },
  });
  if (error) {
    const message = /already|registered|exists/i.test(error.message)
      ? 'Email ini sudah terdaftar.'
      : error.message;
    throw new Error(message);
  }

  const user = data.user;
  if (!user) throw new Error('User gagal dibuat.');

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: user.id,
      full_name: fullName || email.split('@')[0],
      role,
    },
    { onConflict: 'id' },
  );
  if (profileError) throw new Error(profileError.message);

  return {
    user: {
      id: user.id,
      email,
      fullName: fullName || email.split('@')[0],
      role,
      active: true,
    },
    password: providedPassword ? null : password,
  };
}

async function handleSetRole(body: Record<string, unknown>) {
  const admin = serviceClient();
  const id = String(body.id ?? '').trim();
  const role = normRole(body.role);
  if (!id || !role) throw new Error('User dan role wajib diisi.');

  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error) throw new Error(error.message);
  const target = data.user;
  if (!target) throw new Error('User tidak ditemukan.');

  const targetRole = target.app_metadata?.role === 'owner' ? 'owner' : 'cs';
  if (targetRole === 'owner' && role !== 'owner') {
    const { data: owners } = await admin.from('profiles').select('id').eq('role', 'owner');
    if ((owners ?? []).length <= 1) {
      throw new Error('Tidak bisa menurunkan owner terakhir.');
    }
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(id, {
    app_metadata: { ...target.app_metadata, role },
    user_metadata: target.user_metadata,
  });
  if (updateError) throw new Error(updateError.message);

  const { error: profileError } = await admin.from('profiles').update({ role }).eq('id', id);
  if (profileError) throw new Error(profileError.message);

  if (target.email) {
    await admin
      .from('allowed_emails')
      .upsert({ email: target.email.toLowerCase(), role }, { onConflict: 'email' });
  }

  return { id, role };
}

async function handleSetActive(body: Record<string, unknown>) {
  const admin = serviceClient();
  const id = String(body.id ?? '').trim();
  const active = body.active !== false;
  if (!id) throw new Error('User wajib diisi.');

  const { error } = await admin.auth.admin.updateUserById(id, {
    ban_duration: active ? 'none' : '876000h',
  });
  if (error) throw new Error(error.message);

  return { id, active };
}

async function handleDelete(body: Record<string, unknown>, requesterId: string) {
  const admin = serviceClient();
  const id = String(body.id ?? '').trim();
  if (!id) throw new Error('User wajib diisi.');
  if (id === requesterId) throw new Error('Tidak bisa menghapus akun sendiri.');

  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error) throw new Error(error.message);
  const target = data.user;
  if (!target) throw new Error('User tidak ditemukan.');

  const bannedUntil = target.banned_until ? Date.parse(target.banned_until) : 0;
  if (!(Number.isFinite(bannedUntil) && bannedUntil > Date.now())) {
    throw new Error('Nonaktifkan akun dulu sebelum menghapus permanen.');
  }

  if (target.app_metadata?.role === 'owner') {
    const { data: owners } = await admin.from('profiles').select('id').eq('role', 'owner');
    if ((owners ?? []).length <= 1) {
      throw new Error('Tidak bisa menghapus owner terakhir.');
    }
  }

  const email = String(target.email ?? '').toLowerCase();
  const { error: deleteError } = await admin.auth.admin.deleteUser(id);
  if (deleteError) throw new Error(deleteError.message);

  if (email) {
    await admin.from('allowed_emails').delete().eq('email', email);
  }

  return { id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });

  const auth = await requireUser(req);
  if (!auth) return json({ ok: false, error: 'Sesi tidak valid. Login ulang.' }, 401);
  if (!isOwner(auth.user)) {
    return json({ ok: false, error: 'Hanya Owner yang dapat mengelola pengguna.' }, 403);
  }

  if (req.method === 'GET') return json({ ok: true });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Permintaan tidak valid.' }, 400);
  }

  const action = String(body.action ?? '');
  try {
    if (action === 'list') return json({ ok: true, ...(await handleList()) });
    if (action === 'create') return json({ ok: true, ...(await handleCreate(body)) });
    if (action === 'set_role') return json({ ok: true, ...(await handleSetRole(body)) });
    if (action === 'set_active') return json({ ok: true, ...(await handleSetActive(body)) });
    if (action === 'delete') return json({ ok: true, ...(await handleDelete(body, auth.user.id)) });
    return json({ ok: false, error: 'Aksi tidak dikenal.' }, 400);
  } catch (error) {
    const message = errorMessage(error);
    console.error('admin-users error', message);
    return json({ ok: false, error: message }, 500);
  }
});
