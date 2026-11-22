/**
 * Anggaran waktu satu run bot (pengaman supaya run tidak dimatikan paksa Supabase).
 *
 * Latar belakang: Edge Function di paket Free dibatasi sekitar 150 detik per eksekusi. Run yang melewati batas itu
 * dimatikan (HTTP 546) di tengah jalan: balasan sudah terkirim sebagian, pesan dikembalikan ke antrean, lalu diproses
 * ulang sehingga balasan bisa ganda dan customer menunggu lebih lama. Anggaran ini memastikan run SELESAI sendiri
 * dengan rapi sebelum batas itu.
 *
 * Aturan: ronde pertama selalu boleh jalan (kalau tidak, pesan tidak akan pernah terjawab). Ronde berikutnya hanya
 * dimulai kalau sisa anggaran cukup, dan waktu tunggu panggilan AI dipotong supaya tidak melewati anggaran.
 * Fungsi murni tanpa Deno/jaringan supaya bisa diuji.
 */

/** Total waktu (ms) sejak run mulai sampai ronde AI terakhir boleh berakhir. Sisanya untuk tool dan penutupan run. */
export const RUN_LOOP_BUDGET_MS = 100_000;

/** Ronde AI baru tidak dimulai kalau sisa anggaran kurang dari ini. */
export const MIN_ROUND_MS = 20_000;

/** Batas atas waktu tunggu satu panggilan AI (sama dengan default di _shared/mimo.ts). */
export const MAX_MODEL_TIMEOUT_MS = 90_000;

/** Waktu tunggu minimum untuk ronde pertama, meski anggaran sudah menipis oleh persiapan (jeda, klaim, konteks). */
export const FIRST_ROUND_MIN_TIMEOUT_MS = 45_000;

export interface RoundPlan {
  /** false = jangan mulai ronde ini; selesaikan run dengan rapi. */
  go: boolean;
  /** Waktu tunggu panggilan AI untuk ronde ini (ms). 0 bila go = false. */
  timeoutMs: number;
}

/**
 * @param elapsedMs waktu (ms) sejak run mulai
 * @param roundIndex nomor ronde berbasis nol (0 = ronde pertama)
 */
export function planRound(elapsedMs: number, roundIndex: number, budgetMs: number = RUN_LOOP_BUDGET_MS): RoundPlan {
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const remaining = budgetMs - elapsed;

  if (roundIndex <= 0) {
    // Ronde pertama selalu jalan. Waktu tunggunya mengikuti sisa anggaran, tapi tidak kurang dari batas minimum.
    return { go: true, timeoutMs: Math.min(MAX_MODEL_TIMEOUT_MS, Math.max(remaining, FIRST_ROUND_MIN_TIMEOUT_MS)) };
  }
  if (remaining < MIN_ROUND_MS) return { go: false, timeoutMs: 0 };
  return { go: true, timeoutMs: Math.min(MAX_MODEL_TIMEOUT_MS, remaining) };
}
