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
