import { normalizePhone } from '../_shared/wa/closing-core.mjs';

/**
 * Riwayat percakapan yang dilihat model + penunjuk pesan bukti transfer.
 *
 * Dipisah dari index.ts (yang memanggil Deno.serve) supaya murni dan bisa diuji.
 *
 * Kasus yang melatarbelakangi (14 Nov 2026): balasan kami 231 karakter dengan pertanyaan
 * "kode posnya berapa ya?" di UJUNGNYA dipotong di 180 karakter, jadi saat customer menjawab
 * "10230" model tidak tahu itu jawaban apa. Id pesan bukti transfer juga tidak pernah terlihat,
 * jadi setelah data alamat lengkap model tidak bisa memanggil catat_closing.
 */

/** Batas panjang satu balasan kami di riwayat. Rekap dan pertanyaan penutup muat utuh. */
export const REPLY_CLIP_MAX = 1200;

/**
 * Potong teks panjang tetapi pertahankan UJUNGNYA: pertanyaan atau ajakan biasanya ada di akhir
 * balasan. Teks yang muat dikembalikan utuh (spasi dirapikan jadi satu baris).
 */
export function clipKeepTail(text: unknown, max = REPLY_CLIP_MAX): string {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const head = Math.floor(max * 0.4);
  const tail = max - head - 3;
  return `${clean.slice(0, head)} … ${clean.slice(-tail)}`;
}

export interface HistoryRow {
  id?: string | null;
  message?: string | null;
  reply_text?: string | null;
  media_key?: string | null;
  media_url?: string | null;
}

/** Pesan ini membawa gambar/lampiran (foto bukti transfer, screenshot, dan sebagainya). */
export function hasMedia(row: HistoryRow | null | undefined): boolean {
  if (!row) return false;
  return Boolean(row.media_key || row.media_url) || String(row.message || '').trim() === '[lampiran]';
}

/** Blok "Konteks sebelumnya" untuk satu pesan masuk. Kosong kalau tidak ada riwayat. */
export function historyText(item: { riwayat?: HistoryRow[] } | null | undefined): string {
  const history = Array.isArray(item?.riwayat) ? item!.riwayat! : [];
  const lines = history
    .map((h) => {
      const parts: string[] = [];
      const media = hasMedia(h);
      if (h.message || media) {
        // Id pesan bergambar ditampilkan supaya bukti transfer yang dikirim lebih awal tetap bisa
        // dirujuk (inbox_id untuk catat_closing).
        const idNote = media && h.id ? ` (lampiran gambar, inbox_id: ${h.id})` : '';
        parts.push(`    Customer: ${h.message || '[lampiran]'}${idNote}`);
      }
      if (h.reply_text) parts.push(`    Kami: ${clipKeepTail(h.reply_text)}`);
      return parts.join('\n');
    })
    .filter(Boolean);
  return lines.length ? `  Konteks sebelumnya:\n${lines.join('\n')}\n` : '';
}

export interface ProofIndex {
  /** Semua inbox_id bergambar yang dikenal run ini (pesan sekarang + riwayat). */
  mediaIds: Set<string>;
  /** Nomor (format 08…) → inbox_id gambar TERBARU dari nomor itu. */
  bySender: Map<string, string>;
}

/**
 * Kumpulkan pesan bergambar dari batch run ini. Riwayat dari API berurutan lama→baru, dan pesan
 * sekarang adalah yang terbaru, jadi gambar paling akhir menimpa yang lebih lama.
 */
export function collectProofs(items: Array<{ id?: unknown; sender?: unknown; riwayat?: HistoryRow[] } & HistoryRow>): ProofIndex {
  const mediaIds = new Set<string>();
  const bySender = new Map<string, string>();
  for (const item of items || []) {
    const key = normalizePhone(item?.sender);
    const rows: Array<HistoryRow & { id?: unknown }> = [
      ...(Array.isArray(item?.riwayat) ? item.riwayat : []),
      item,
    ];
    for (const row of rows) {
      const id = String(row?.id ?? '').trim();
      if (!id || !hasMedia(row as HistoryRow)) continue;
      mediaIds.add(id);
      if (key) bySender.set(key, id);
    }
  }
  return { mediaIds, bySender };
}

/**
 * Pastikan inbox_id catat_closing menunjuk pesan BERGAMBAR dari customer yang sama.
 * - id dari model sudah pesan bergambar yang dikenal → dipakai apa adanya.
 * - kosong, atau menunjuk pesan teks (mis. "Kode pos nya") → ganti dengan gambar terbaru pengirim itu.
 * - tidak ada gambar yang dikenal → argumen dikembalikan tanpa diubah (perilaku lama).
 */
export function resolveProofInboxId<T extends Record<string, any>>(args: T, proofs?: ProofIndex): T {
  if (!proofs) return args;
  const given = String(args?.inbox_id ?? '').trim();
  if (given && proofs.mediaIds.has(given)) return args;
  const fallback = proofs.bySender.get(normalizePhone(args?.nomor));
  if (!fallback) return args;
  return { ...args, inbox_id: fallback };
}
