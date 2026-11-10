import { getSupabaseClient } from '@/lib/supabase/client';

export type AcademyRole = 'owner' | 'cs';

export interface AcademyUser {
  id: string;
  email: string;
  fullName: string;
  role: AcademyRole;
  active: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
}

export interface AdminUsersResult<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function readError(error: unknown): Promise<string> {
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // Body mungkin sudah terpakai; jatuh ke pesan SDK.
    }
  }
  if (error instanceof Error && error.message) {
    if (/Failed to send a request|Failed to fetch|FunctionsFetchError|FunctionsRelayError/i.test(error.message)) {
      return 'Layanan admin belum dapat dihubungi. Pastikan Edge Function admin-users sudah di-deploy.';
    }
    return error.message;
  }
  return 'Permintaan gagal diproses.';
}

export async function callAdminUsers<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<AdminUsersResult<T>> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: 'Supabase belum dikonfigurasi di browser.' };
  }

  const { data, error } = await client.functions.invoke('admin-users', {
    body: { action, ...payload },
  });
  if (error) return { ok: false, error: await readError(error) };

  const body = data as { ok?: boolean; error?: string } | null;
  if (!body || body.ok === false) {
    return { ok: false, error: body?.error ?? 'Permintaan gagal diproses.' };
  }
  return { ok: true, data: data as T };
}
