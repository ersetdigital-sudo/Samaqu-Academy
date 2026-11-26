/**
 * Blok STATUS PROMO untuk prompt bot: hanya memuat promo yang berlaku HARI INI.
 *
 * Sumbernya endpoint website `GET /api/ops/promo-status`, yang membaca pengaturan admin
 * (menu Promo > "Promo yang disebut bot") dan menghitung saklar + tanggal di SATU tempat (sama dengan checkout
 * dan draft). Bot tidak menghitung tanggal sendiri.
 *
 * Gagal membaca (null) = perilaku sebelum fitur ini: tidak ada promo ongkir, bonus cover bot tetap berlaku.
 * Promo Free Cover Hanger WEBSITE (iklan) tidak dibaca di sini.
 */

export interface PromoStatus {
  today: string;
  ongkirJabodetabek: boolean;
  ongkirLuar: boolean;
  ongkirLuarPersen: number;
  fchBot: boolean;
}

/** `fetcher` = `opsFetch` dari tools.ts (dioper supaya tidak ada import melingkar). */
export async function readPromoStatus(fetcher: (path: string) => Promise<any>): Promise<PromoStatus | null> {
  try {
    const row = await fetcher('/api/ops/promo-status');
    if (!row || typeof row !== 'object') return null;
    return {
      today: String(row.today || ''),
      ongkirJabodetabek: row.ongkirJabodetabek === true,
      ongkirLuar: row.ongkirLuar === true,
      ongkirLuarPersen: Math.max(0, Math.min(100, Math.round(Number(row.ongkirLuarPersen) || 0))),
      fchBot: row.fchBot !== false,
    };
  } catch {
    return null;
  }
}

/** Teks blok STATUS PROMO. `null` (tidak terbaca) diperlakukan sama dengan "tidak ada promo ongkir, bonus cover berlaku". */
export function promoStatusContext(status: PromoStatus | null): string {
  const jabo = status?.ongkirJabodetabek === true;
  const luar = status?.ongkirLuar === true;
  const fch = status ? status.fchBot : true;
  const baris: string[] = [];
  if (jabo) baris.push('- Free ongkir Jabodetabek: BERLAKU. Ongkir ke alamat Jabodetabek Rp0 (J&T EZ dan ECO).');
  if (luar) {
    baris.push(
      `- Potongan ongkir luar Jabodetabek: BERLAKU. Ongkir ke alamat di luar Jabodetabek dipotong ${status?.ongkirLuarPersen}% dari tarif J&T (EZ dan ECO).`,
    );
  }
  if (!jabo && !luar) {
    baris.push('- Promo ongkir: TIDAK ADA yang berlaku hari ini. Jangan menjanjikan gratis ongkir atau potongan ongkir.');
  }
  baris.push(
    fch
      ? '- Free Cover Hanger (pembelian pertama): BERLAKU, ikuti aturan bonus di bagian Promo (customer baru + stok cover ada).'
      : '- Free Cover Hanger (pembelian pertama): TIDAK BERLAKU hari ini. Jangan menawarkan atau menulis bonus free cover + hanger.',
  );
  return [
    `STATUS PROMO (hari ini${status?.today ? ` ${status.today}` : ''}, dari pengaturan admin):`,
    ...baris,
    'Hanya sebut promo yang tertulis BERLAKU di sini. Angka ongkir resmi (tarif J&T, ongkir setelah promo, hemat berapa) selalu dari cek_ongkir / rekap_pesanan: salin apa adanya, jangan menghitung sendiri.',
  ].join('\n');
}
