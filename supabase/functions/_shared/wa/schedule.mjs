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
