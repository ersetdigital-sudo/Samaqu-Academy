const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Jadwal AI (WIB):
 * - Senin-Sabtu: 16.30-07.30
 * - Minggu: full 24 jam (admin libur), lanjut sampai Senin 07.30
 * - Senin 07.30-16.30: off
 */
export function isWaOnline(date = new Date()) {
  const w = new Date(date.getTime() + WIB_OFFSET_MS);
  const day = w.getUTCDay(); // 0 Minggu, 1 Senin
  const minutes = w.getUTCHours() * 60 + w.getUTCMinutes();

  if (day === 0) return true;
  if (day === 1 && minutes < 7 * 60 + 30) return true;
  return minutes >= 16 * 60 + 30 || minutes < 7 * 60 + 30;
}

export function waScheduleLabel() {
  return "Senin-Sabtu 16.30-07.30; Minggu full";
}

/**
 * Jam kerja ADMIN untuk penyaring pesan (WIB, menit sejak 00.00): Senin-Sabtu 07.30 sampai 16.40.
 * Pesan yang MASUK di rentang ini urusan admin: bot tidak membalasnya (ditandai skipped), supaya chat yang sudah dijawab
 * admin lewat HP tidak dijawab ulang bot saat jam AI buka. 16.30-16.40 sengaja jadi penyangga: admin masih menutup
 * chat, dan pesan yang masuk di jam itu tetap ditangani admin. Ini TIDAK mengubah isWaOnline (jam bot tetap 16.30-07.30).
 */
export const ADMIN_START_MIN = 7 * 60 + 30;
export const ADMIN_HANDOFF_MIN = 16 * 60 + 40;

/** Apakah pesan yang masuk pada waktu `date` termasuk jam kerja admin? */
export function isAdminHoursMessage(date = new Date()) {
  const w = new Date(date.getTime() + WIB_OFFSET_MS);
  if (w.getUTCDay() === 0) return false; // Minggu: admin libur
  const minutes = w.getUTCHours() * 60 + w.getUTCMinutes();
  return minutes >= ADMIN_START_MIN && minutes < ADMIN_HANDOFF_MIN;
}

/**
 * Rentang jam kerja admin (ISO UTC) dalam `days` hari terakhir sampai sekarang, untuk penyaring massal.
 * Rentang hari ini dipotong sampai sekarang; Minggu dilewati; rentang yang belum mulai tidak ikut.
 */
export function adminHoursWindows(nowMs = Date.now(), days = 3) {
  const out = [];
  const wibNow = new Date(nowMs + WIB_OFFSET_MS);
  const y = wibNow.getUTCFullYear();
  const m = wibNow.getUTCMonth();
  const d = wibNow.getUTCDate();
  for (let k = 0; k < days; k += 1) {
    const dayStartUtc = Date.UTC(y, m, d - k) - WIB_OFFSET_MS; // 00.00 WIB hari itu
    if (new Date(Date.UTC(y, m, d - k)).getUTCDay() === 0) continue;
    const from = dayStartUtc + ADMIN_START_MIN * 60_000;
    const to = Math.min(dayStartUtc + ADMIN_HANDOFF_MIN * 60_000, nowMs);
    if (from < to) out.push({ from: new Date(from).toISOString(), to: new Date(to).toISOString() });
  }
  return out;
}

/**
 * Baris waktu sekarang untuk prompt agen. Dipakai bot lokal dan server supaya
 * sapaan pagi/siang/sore/malam mengikuti jam WIB, bukan jam server.
 */
export function waktuSekarangWib(date = new Date()) {
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  const hour = Number(get("hour")) % 24;
  const label =
    hour >= 4 && hour < 11 ? "pagi" : hour >= 11 && hour < 15 ? "siang" : hour >= 15 && hour < 18 ? "sore" : "malam";
  return `Waktu sekarang: ${get("weekday")}, ${get("day")} ${get("month")} ${get("year")} pukul ${String(hour).padStart(2, "0")}.${get("minute")} WIB (${label})`;
}
