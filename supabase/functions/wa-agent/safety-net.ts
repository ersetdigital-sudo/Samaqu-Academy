import { normalizePhone } from '../_shared/wa/closing-core.mjs';

/**
 * Jaring pengaman closing: bukti transfer masuk tapi tidak ada yang mencatatnya.
 *
 * Dipakai wa-agent untuk memunculkan kasus di Perlu Review supaya admin langsung tahu, APA PUN
 * penyebabnya (timeout model, id lampiran salah, error tool, bot yang salah paham). Aturannya
 * sengaja dari KONDISI AKHIR, bukan dari penyebab: "ada bukti, tapi tidak ada closing/draft/order/
 * kasus untuk nomor itu".
 *
 * Modul ini murni (tanpa jaringan) supaya bisa diuji dengan data nyata maupun sintetis.
 *
 * Kasus yang melatarbelakangi (14 Nov 2026): bukti transfer customer dikirim sebelum alamatnya
 * lengkap; bot tidak pernah memanggil catat_closing, dan tidak ada yang menyadarinya.
 */

/** Tunggu dulu sebelum menganggap bukti "tidak tertangani" (bot/admin butuh waktu). */
export const SAFETY_WAIT_MS = 20 * 60 * 1000;
/** Bukti lebih tua dari ini tidak dipantau lagi (sudah lewat, urusan manual). */
export const SAFETY_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** Closing/draft/order yang dibuat sesaat SEBELUM bukti masih dihitung (admin kadang mencatat lebih dulu). */
export const SAFETY_GRACE_MS = 30 * 60 * 1000;

export interface InboxRow {
  id: string;
  sender: string;
  sender_name?: string | null;
  message?: string | null;
  reply_text?: string | null;
  media_key?: string | null;
  media_url?: string | null;
  created_at: string;
  /** `sent` = bot/admin sudah membalas; `skipped` = dilewati (mis. diambil alih admin). */
  status?: string | null;
}

export interface SafetyInput {
  now: number;
  /** Pesan masuk 24 jam terakhir (non-grup), semua pengirim. */
  inbox: InboxRow[];
  closings: Array<{ sender?: string | null; created_at: string }>;
  drafts: Array<{ customer_whatsapp?: string | null; source_inbox_id?: string | null; created_at: string }>;
  orders: Array<{ customer_whatsapp?: string | null; created_at: string }>;
  /** Kasus Perlu Review (status apa pun), untuk dedupe. */
  escalations: Array<{ inbox_id?: string | null; sender?: string | null; created_at?: string | null }>;
  /** Nomor yang percakapannya diambil alih admin (bot tidak membalas). */
  handover?: Set<string>;
  waitMs?: number;
  lookbackMs?: number;
}

export interface UnclosedProof {
  inboxId: string;
  sender: string;
  senderName: string;
  proofAt: string;
  /** Kata kunci pembayaran yang membuat gambar ini dianggap bukti (untuk log/penjelasan). */
  basis: string;
}

const MEDIA_PLACEHOLDER = '[lampiran]';

export function hasMedia(row: InboxRow): boolean {
  return Boolean(row.media_key || row.media_url) || String(row.message || '').trim() === MEDIA_PLACEHOLDER;
}

/**
 * Balasan bot yang mengirim REKENING: nama bank diikuti nomor panjang (mis. "Transfer ke BSI 7153280058
 * a.n. …"). Sengaja ketat: kata umum ("rekening", "a.n") muncul di percakapan biasa dan membuat foto
 * produk ikut tertandai.
 */
const ASKED_TO_PAY = /\b(bsi|bca|bri|bni|mandiri|cimb|permata)\b[\s:.\-]*(no\.?\s*rek\w*\.?\s*)?\d{7,}/i;
/** Balasan bot yang mengakui menerima bukti: "Bukti transfer Rp… sudah kami terima", "Pembayaran … sudah kami terima". */
const ACKED_PROOF = /(bukti\s+(transfer|pembayaran)[^\n]{0,70}?terima|pembayaran[^\n]{0,50}?sudah[^\n]{0,20}?terima)/i;

const ts = (value: string | null | undefined): number => {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : NaN;
};

/**
 * Bukti transfer yang belum tertangani. Satu hasil per nomor (gambar TERLAMA yang belum tercakup).
 * Syarat sebuah gambar dihitung bukti transfer:
 *  - dari nomor pribadi (bukan grup), sudah dibalas bot (`status = sent` + `reply_text`), dan
 *  - bot sebelumnya (24 jam) sudah mengirim rekening/meminta transfer, ATAU balasan atas gambar itu
 *    sendiri menyebut "bukti transfer/pembayaran ... diterima".
 * Gambar yang dilewati (`skipped`, diambil alih admin) TIDAK dihitung: admin yang menanganinya.
 */
export function findUnclosedProofs(input: SafetyInput): UnclosedProof[] {
  const waitMs = input.waitMs ?? SAFETY_WAIT_MS;
  const lookbackMs = input.lookbackMs ?? SAFETY_LOOKBACK_MS;
  const handover = input.handover ?? new Set<string>();
  const rows = [...(input.inbox || [])].sort((a, b) => ts(a.created_at) - ts(b.created_at));

  // Kasus yang sudah ada per pesan dan per nomor (untuk dedupe).
  const escalatedInbox = new Set((input.escalations || []).map((e) => String(e.inbox_id || '')).filter(Boolean));

  const bySender = new Map<string, UnclosedProof>();
  for (const row of rows) {
    const at = ts(row.created_at);
    if (!Number.isFinite(at)) continue;
    if (!hasMedia(row)) continue;
    if (at > input.now - waitMs || at < input.now - lookbackMs) continue;
    if (String(row.status || '') !== 'sent' || !String(row.reply_text || '').trim()) continue;

    const sender = normalizePhone(row.sender);
    if (!sender) continue;
    if (handover.has(String(row.sender)) || handover.has(sender)) continue;

    // Konteks pembayaran: bot meminta transfer sebelumnya, atau mengakui menerima bukti.
    const prior = rows.filter(
      (other) => normalizePhone(other.sender) === sender && ts(other.created_at) < at && ts(other.created_at) >= at - lookbackMs,
    );
    const asked = prior.some((other) => ASKED_TO_PAY.test(String(other.reply_text || '')));
    const acked = ACKED_PROOF.test(String(row.reply_text || ''));
    if (!asked && !acked) continue;

    // Sudah tercakup? (closing/draft/order/kasus untuk nomor yang sama, dibuat sekitar/ setelah bukti)
    const since = at - SAFETY_GRACE_MS;
    const sameSender = (phone: string | null | undefined) => normalizePhone(phone) === sender;
    const closed = (input.closings || []).some((c) => sameSender(c.sender) && ts(c.created_at) >= since);
    const drafted = (input.drafts || []).some(
      (d) => String(d.source_inbox_id || '') === row.id || (sameSender(d.customer_whatsapp) && ts(d.created_at) >= since),
    );
    const ordered = (input.orders || []).some((o) => sameSender(o.customer_whatsapp) && ts(o.created_at) >= since);
    const raised =
      escalatedInbox.has(row.id) ||
      (input.escalations || []).some((e) => sameSender(e.sender) && ts(e.created_at) >= at);
    if (closed || drafted || ordered || raised) {
      bySender.delete(sender);
      continue;
    }

    // Satu kasus per nomor, memakai gambar TERLAMA yang belum tercakup (itu yang menunggu paling lama).
    if (bySender.has(sender)) continue;
    bySender.set(sender, {
      inboxId: row.id,
      sender: String(row.sender),
      senderName: String(row.sender_name || '').trim(),
      proofAt: row.created_at,
      basis: asked ? 'bot sudah mengirim rekening' : 'bot mengakui menerima bukti',
    });
  }
  return [...bySender.values()];
}

/** Jam WIB "HH.MM" untuk teks kasus. */
export function jamWib(iso: string): string {
  const d = new Date(Date.parse(iso) + 7 * 3600e3);
  return `${String(d.getUTCHours()).padStart(2, '0')}.${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** Teks kasus Perlu Review (ringkasan + alasan) untuk satu bukti yang belum tertangani. */
export function caseText(proof: UnclosedProof): { summary: string; reason: string; customerMessage: string } {
  const who = proof.senderName ? `${proof.senderName} (${proof.sender})` : proof.sender;
  return {
    summary:
      `Gambar (diduga bukti transfer) dari ${who} masuk pukul ${jamWib(proof.proofAt)} WIB, tapi belum ada closing, draft, atau order untuk nomor ini. ` +
      'Buka percakapannya, cek gambarnya (nominal dan rekening tujuan), lalu buat draft transaksi atau balas customer.',
    reason: 'bukti_tanpa_closing',
    customerMessage: '[lampiran bukti transfer]',
  };
}
