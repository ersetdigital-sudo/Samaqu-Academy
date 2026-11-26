/**
 * Pagar data closing: kode pos dan nama penerima HARUS berasal dari tulisan customer.
 *
 * Latar belakang: model cepat (mis. DeepSeek) kadang mengisi data yang kosong dari ingatan
 * (kode pos tebakan "20124", nama "-" atau "Customer") lalu memanggil `catat_closing`, sehingga
 * draft Perlu Review berisi alamat palsu. Aturan di persona saja tidak cukup (uji 26 Nov 2026:
 * 3 dari 3 run tetap menebak), jadi dicek di server.
 *
 * Prinsip fail-open: kalau teks chat customer tidak tersedia (kosong), TIDAK ada yang ditolak.
 * Closing yang hilang lebih mahal daripada data yang belum terverifikasi.
 *
 * Murni (tanpa Deno/jaringan) supaya bisa diuji: npx tsx scripts/test-closing-guard.mts
 */

/** Kata yang bukan nama orang; model memakainya saat nama tidak diketahui. */
const PLACEHOLDER_NAMA = new Set([
  '-', '--', 'customer', 'pelanggan', 'penerima', 'pembeli', 'kak', 'ka', 'kakak', 'bapak', 'ibu',
  'pak', 'bu', 'anonim', 'unknown', 'n/a', 'na', 'tidak ada', 'tanpa nama', 'belum ada',
]);

/** Ambil huruf kecil tanpa tanda baca/aksen; spasi dirapikan. */
function normalisasi(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Kumpulkan teks yang DITULIS CUSTOMER dari batch run ini + riwayatnya.
 * Balasan kami (`reply_text`) sengaja tidak ikut: kalau model pernah menebak, tebakan itu tidak
 * boleh "membenarkan" dirinya sendiri.
 */
export function customerTextFrom(items: Array<{ message?: unknown; riwayat?: Array<{ message?: unknown }> }>): string {
  const parts: string[] = [];
  for (const item of items || []) {
    for (const h of Array.isArray(item?.riwayat) ? item.riwayat! : []) {
      const text = String(h?.message ?? '').trim();
      if (text) parts.push(text);
    }
    const now = String(item?.message ?? '').trim();
    if (now) parts.push(now);
  }
  return parts.join('\n');
}

/**
 * Daftar masalah (kosong = lolos). Setiap entri berupa kalimat siap tampil ke model.
 * `customerText` kosong => fail-open.
 */
export function findUngroundedClosingData(
  args: { nama?: unknown; kode_pos?: unknown },
  customerText: string,
): string[] {
  const text = String(customerText || '');
  if (!text.trim()) return [];
  const problems: string[] = [];

  // Kode pos: persis 5 angka, dan angka itu berdiri sendiri di tulisan customer
  // (bukan potongan nomor HP atau nominal yang lebih panjang).
  const kodePos = String(args?.kode_pos ?? '').trim();
  const kodePosOk = /^\d{5}$/.test(kodePos) && new RegExp(`(?<!\\d)${kodePos}(?!\\d)`).test(text);
  if (!kodePosOk) {
    problems.push(
      kodePos && /^\d{5}$/.test(kodePos)
        ? `kode pos ${kodePos} tidak ada di tulisan customer`
        : 'kode pos belum ada di tulisan customer',
    );
  }

  // Nama penerima: bukan kata pengganti, dan minimal satu kata namanya (>= 3 huruf) tertulis oleh customer.
  const nama = normalisasi(args?.nama);
  if (!nama || PLACEHOLDER_NAMA.has(nama)) {
    problems.push('nama penerima belum ada di tulisan customer');
  } else {
    const kata = nama.split(' ').filter((k) => k.length >= 3 && !PLACEHOLDER_NAMA.has(k));
    if (kata.length) {
      const teks = normalisasi(text);
      if (!kata.some((k) => teks.includes(k))) problems.push(`nama "${String(args?.nama).trim()}" tidak ada di tulisan customer`);
    }
  }
  return problems;
}

/** Kalimat galat untuk model. */
export function ungroundedMessage(problems: string[]): string {
  // Kalimat contoh mengikuti data yang kurang. Model cenderung meniru contoh, jadi contoh inilah
  // yang menggantikan kebiasaan menulis "bukti sudah kami terima" padahal closing belum tercatat.
  const perluKodePos = problems.some((p) => /kode pos/i.test(p));
  const perluNama = problems.some((p) => /nama/i.test(p));
  const contoh = [
    perluKodePos ? '"Ka, untuk kode posnya berapa ya?"' : '',
    perluNama ? '"Ka, nama penerima paketnya siapa ya?"' : '',
  ].filter(Boolean).join(' dan ');
  return (
    `Data closing belum bisa dicatat: ${problems.join('; ')}. ` +
    'Closing BELUM tercatat, jadi JANGAN menulis "sudah kami terima", "sudah diterima", "kami proses", ' +
    'atau kalimat sejenis. Jangan menebak atau mengisi dari ingatan. ' +
    `Balas customer hanya dengan pertanyaan untuk data yang kurang itu${contoh ? `, mis. ${contoh}` : ''}. ` +
    '(Kalau customer sudah menulisnya di "Konteks sebelumnya", pakai persis tulisannya.) ' +
    'Setelah customer menjawab, panggil catat_closing lagi, dan baru setelah berhasil balas bahwa bukti sudah diterima.'
  );
}
