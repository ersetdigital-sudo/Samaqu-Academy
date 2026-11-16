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
  /** Kode galat dari server (mis. needs_confirm, lint_hard, owner_only) dan rinciannya, bila ada. */
  code?: string;
  soft?: string[];
  hard?: string[];
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
        const body = (await context.json()) as { error?: string; code?: string; soft?: string[]; hard?: string[] };
        if (body?.error) return { ok: false, error: body.error, code: body.code, soft: body.soft, hard: body.hard };
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
  /** Nomor customer (62…) untuk membuka percakapannya di tab Chat. Kosong pada respons lama. */
  sender?: string;
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
  /** Isi aturan lengkap untuk "Lihat isi". */
  text: string;
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

/* ── Pelajaran AI Fase 2: usulan pelajaran. Aksi yang mengubah sesuatu hanya diterima server dari owner. ── */

export interface LessonFlags {
  hard: string[];
  soft: string[];
}

export interface LessonProposal {
  id: string;
  status: 'proposed' | 'publishing' | 'published' | 'rejected' | 'retired' | string;
  groupKey: string | null;
  kind: string;
  kindLabel: string;
  source: string;
  title: string;
  lesson: string;
  question: string | null;
  note: string | null;
  evidence: Array<Record<string, unknown>>;
  cases: number;
  replacesLearningId: string | null;
  publishedLearningId: string | null;
  createdAt: string;
  createdBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  flags: LessonFlags;
  stuck: boolean;
}

export function loadProposals() {
  return invoke<{ proposals: LessonProposal[]; publishedSoftLimit: number }>('lessons_proposals');
}

export function generateLessons(input: { groupKey?: string; learningId?: string }) {
  return invoke<{ created: number; message: string; proposals: LessonProposal[] }>('lessons_generate', {
    group_key: input.groupKey,
    learning_id: input.learningId,
  });
}

export function editProposal(id: string, lessonText: string) {
  return invoke<{ proposal: LessonProposal }>('lessons_edit', { id, lesson_text: lessonText });
}

export function rejectProposal(id: string, reason?: string) {
  return invoke<{ proposal: LessonProposal }>('lessons_reject', { id, reason });
}

export function publishProposal(id: string, lessonText: string, confirmSoft = false) {
  return invoke<{ proposal: LessonProposal; learningId: string; publishedCount: number; warnings: string[] }>('lessons_publish', {
    id,
    lesson_text: lessonText,
    confirm_soft: confirmSoft,
  });
}

export function retireLearning(learningId: string) {
  return invoke<{ learningId: string; proposalId: string | null }>('lessons_retire', { learning_id: learningId });
}
