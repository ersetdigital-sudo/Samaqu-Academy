import {
  createClient,
  type SupabaseClient,
  type User,
} from 'npm:@supabase/supabase-js@2.118.0';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Terjadi kesalahan pada server AI.';
}

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key =
    Deno.env.get('AI_SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    '';
  if (!url || !key) {
    throw new Error('SUPABASE_URL / AI_SERVICE_ROLE_KEY belum dikonfigurasi.');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const USER_TTL_MS = 5 * 60 * 1000;
const userCache = new Map<string, { user: User; exp: number }>();

function pruneUserCache() {
  if (userCache.size <= 100) return;
  const now = Date.now();
  for (const [key, value] of userCache) {
    if (value.exp <= now) userCache.delete(key);
  }
  while (userCache.size > 100) {
    const oldest = userCache.keys().next().value;
    if (!oldest) break;
    userCache.delete(oldest);
  }
}

export async function requireUser(
  req: Request,
): Promise<{ user: User; supabase: SupabaseClient } | null> {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!url || !anon) return null;
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authorization.slice('Bearer '.length);
  const hit = userCache.get(token);
  if (hit && hit.exp > Date.now()) {
    return { user: hit.user, supabase };
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  userCache.set(token, { user: data.user, exp: Date.now() + USER_TTL_MS });
  pruneUserCache();
  return { user: data.user, supabase };
}

export function isOwner(user: User): boolean {
  return user.app_metadata?.role === 'owner';
}
