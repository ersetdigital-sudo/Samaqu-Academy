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
  /** Lampiran (mis. bukti transfer) — URL sementara dari Fonnte. */
  media_url?: string | null;
  filename?: string | null;
  /** Bot yang mengklaim/membalas pesan ini: "local" atau "server". */
  handled_by?: string | null;
}

export interface WaRun {
  id: number;
  created_at: string;
  mode: string;
  handled: number;
  replied: number;
  held: number;
  leftover: number;
  rounds: number;
  tools: string[];
  duration_ms: number | null;
  error: string | null;
  note: string | null;
  detail: string | null;
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

/**
 * Log bot. `compact` = sembunyikan run kosong di server; jumlah run kosong dikembalikan di `idle`.
 * Tanpa `compact` perilakunya sama seperti dulu.
 */
export function loadRuns(limit = 50, compact = false) {
  return invoke<{ items: WaRun[]; idle?: { count: number; since: string | null } | null }>('logs', { limit, compact });
}

/* ── Pelajaran AI (Fase 1, baca saja). Bentuknya mengikuti supabase/functions/_shared/lessons-analysis.ts ── */

export interface LessonsExample {
  id: string;
  inboxId: string | null;
  when: string;
  who: string;
  status: string;
  reason: string;
  summary: string;
}

export interface LessonsGroup {
  key: string;
  label: string;
  nature: string;
  natureLabel: string;
  hint: string;
  cases: number;
  open: number;
  uniqueOpen: number;
  customers: number;
  examples: LessonsExample[];
}

export interface LessonsRepeat {
  who: string;
  cases: number;
  open: number;
  kinds: string[];
  firstAt: string;
  lastAt: string;
}

export interface LessonsLearning {
  id: string;
  topic: string;
  scope: string;
  chars: number;
  created_at: string;
  flags: string[];
}

export interface LessonsOverview {
  generatedAt: string;
  totals: {
    escalations: number;
    open: number;
    answered: number;
    closed: number;
    uniqueOpen: number;
    duplicateOpen: number;
    learnings: number;
    published: number;
    needReview: number;
  };
  groups: LessonsGroup[];
  repeats: LessonsRepeat[];
  learnings: LessonsLearning[];
}

export interface LessonsTrace {
  since: string;
  /** false = tabel wa_tool_calls belum bisa dibaca (mis. migrasi belum jalan). */
  ready: boolean;
  total: number;
  errors: number;
  tools: Array<{ tool: string; calls: number; errors: number; avgMs: number }>;
  runsWithInbox: number;
}

export function loadLessons() {
  return invoke<{ overview: LessonsOverview; trace: LessonsTrace }>('lessons');
}
