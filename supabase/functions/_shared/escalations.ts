/**
 * Eskalasi "Pertanyaan AI" yang dijawab dari Chat Academy (menggantikan tab Pertanyaan AI di panel admin SAMAQU).
 *
 * Aturan:
 *  - Hanya eskalasi `open`/`claimed` milik satu customer yang dihitung "menunggu". Format nomor 08… dan 62… dianggap sama.
 *  - Membalas customer di Chat menandai SEMUA eskalasi menunggu milik customer itu `answered` dan menyimpan balasannya
 *    di `reply_text`: itu bahan yang dipakai tab Pelajaran AI untuk menyusun aturan.
 *  - TIDAK membuat pelajaran apa pun. Pelajaran hanya lahir dari tab Pelajaran AI (disetujui owner).
 *  - Semua fungsi menerima akses database lewat `deps` supaya bisa dites tanpa jaringan.
 */
import { senderKey } from './lessons-analysis.ts';

export interface EscalationDeps {
  /** REST service-role ke database SAMAQU (wa_escalations). */
  samaqu: (path: string, init?: RequestInit) => Promise<any>;
  now?: () => Date;
}

export interface PendingEscalation {
  id: string;
  sender: string;
  name: string;
  reason: string;
  summary: string;
  message: string;
  status: string;
  createdAt: string;
}

const COLUMNS = 'id,sender,sender_name,reason,summary,customer_message,status,created_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const nowOf = (deps: EscalationDeps) => (deps.now ? deps.now() : new Date()).toISOString();

function clip(text: unknown, max: number): string {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/** Eskalasi yang masih menunggu untuk satu customer, terbaru dulu. */
export async function pendingFor(deps: EscalationDeps, sender: string): Promise<PendingEscalation[]> {
  const key = senderKey(sender);
  if (!key) return [];
  const rows = await deps.samaqu(`wa_escalations?select=${COLUMNS}&status=in.(open,claimed)&order=created_at.desc&limit=500`);
  return (Array.isArray(rows) ? rows : [])
    .filter((row: { sender?: string | null }) => senderKey(row.sender) === key)
    .map((row: Record<string, unknown>) => ({
      id: String(row.id),
      sender: String(row.sender ?? ''),
      name: String(row.sender_name ?? ''),
      reason: clip(row.reason, 160),
      summary: clip(row.summary || row.customer_message, 320),
      message: clip(row.customer_message, 320),
      status: String(row.status ?? ''),
      createdAt: String(row.created_at ?? ''),
    }));
}

/** Tandai semua eskalasi menunggu milik customer ini `answered` dengan balasan admin. Mengembalikan jumlahnya. */
export async function markAnswered(deps: EscalationDeps, sender: string, replyText: string): Promise<number> {
  const text = String(replyText ?? '').trim();
  if (!text) return 0;
  const ids = (await pendingFor(deps, sender)).map((item) => item.id).filter((id) => UUID.test(id));
  if (!ids.length) return 0;
  const now = nowOf(deps);
  const updated = await deps.samaqu(`wa_escalations?id=in.(${ids.join(',')})&status=in.(open,claimed)`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'answered', reply_text: text.slice(0, 2000), replied_at: now, updated_at: now }),
  });
  return Array.isArray(updated) ? updated.length : 0;
}

/** Tutup satu eskalasi tanpa membalas (mis. sudah selesai lewat jalur lain). */
export async function closeEscalation(deps: EscalationDeps, id: string): Promise<void> {
  if (!UUID.test(String(id ?? ''))) throw new Error('ID eskalasi tidak valid.');
  const updated = await deps.samaqu(`wa_escalations?id=eq.${id}&status=in.(open,claimed,answered)`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'closed', updated_at: nowOf(deps) }),
  });
  if (!Array.isArray(updated) || updated.length === 0) throw new Error('Eskalasi tidak ditemukan atau sudah selesai.');
}
