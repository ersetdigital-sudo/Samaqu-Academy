import { getSupabaseClient } from '@/lib/supabase/client';

export interface WaConversation {
  sender: string;
  name: string;
  lastMessage: string;
  lastAt: string;
  lastStatus: string;
  pending: number;
  sent: number;
  total: number;
  handover: boolean;
}

export interface WaMessage {
  id: string;
  sender: string;
  sender_name?: string | null;
  message: string | null;
  status: string;
  created_at: string;
  replied_at?: string | null;
  reply_text?: string | null;
  error?: string | null;
}

export interface WaStats {
  pending: number;
  processing: number;
  sent: number;
  skipped: number;
  total: number;
}

export interface WaEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function invoke<T>(action: string, payload: Record<string, unknown> = {}): Promise<WaEnvelope<T>> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase belum dikonfigurasi di browser.' };

  const { data, error } = await client.functions.invoke('wa-admin', {
    body: { action, ...payload },
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        const body = (await context.json()) as { error?: string };
        if (body?.error) return { ok: false, error: body.error };
      } catch {
        // biarkan pesan SDK
      }
    }
    return { ok: false, error: error.message || 'Tidak bisa menghubungi server.' };
  }

  const body = data as { ok?: boolean; error?: string } | null;
  if (!body || body.ok === false) {
    return { ok: false, error: body?.error || 'Permintaan gagal.' };
  }
  return { ok: true, data: data as T };
}

export function loadConversations() {
  return invoke<{ items: WaConversation[]; stats: WaStats }>('conversations');
}

export function loadMessages(sender: string) {
  return invoke<{ items: WaMessage[] }>('messages', { sender });
}

export function sendReply(sender: string, message: string) {
  return invoke<{ target: string }>('reply', { sender, message });
}

export function takeOver(sender: string) {
  return invoke<Record<string, never>>('takeover', { sender });
}

export function releaseConversation(sender: string) {
  return invoke<Record<string, never>>('release', { sender });
}
