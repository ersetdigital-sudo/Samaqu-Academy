import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Client khusus Supabase SAMAQU untuk channel Realtime wa_inbox.
 * Anon key aman di browser; tidak memakai sesi auth SAMAQU.
 */
let realtimeClient: SupabaseClient | null = null;

export function isSamaquRealtimeConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SAMAQU_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SAMAQU_SUPABASE_ANON_KEY,
  );
}

export function getSamaquRealtimeClient(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (!isSamaquRealtimeConfigured()) return null;
  if (!realtimeClient) {
    realtimeClient = createClient(
      process.env.NEXT_PUBLIC_SAMAQU_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SAMAQU_SUPABASE_ANON_KEY as string,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }
  return realtimeClient;
}
