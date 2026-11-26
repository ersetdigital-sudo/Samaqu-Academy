/**
 * Persona bot: tawaran Cover + Hanger berbayar + penonjolan promo ongkir (27 Nov 2026).
 *
 * PENGGANTIAN SEMPIT: satu bagian baru disisipkan sebelum "## Alur closing" dan satu kalimat di "## Promo" diperluas; sisa persona tidak disentuh.
 * Tiap potongan lama HARUS ada tepat satu kali, kalau tidak skrip berhenti tanpa menulis.
 *
 *   node supabase/rollback/20261127_persona_cover_promo_ongkir.mjs dry        # tampilkan diff, TIDAK menulis
 *   node supabase/rollback/20261127_persona_cover_promo_ongkir.mjs apply      # simpan cadangan lalu tulis
 *   node supabase/rollback/20261127_persona_cover_promo_ongkir.mjs rollback   # kembalikan potongan ke teks lama
 *
 * Kredensial dibaca dari env ACADEMY_SUPABASE_URL + ACADEMY_SERVICE_ROLE_KEY (atau dari file env di
 * ENV_FILE=... bila ada). JANGAN menjalankan scripts/sync-wa-knowledge.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const mode = process.argv[2] || 'dry';
if (!['dry', 'apply', 'rollback'].includes(mode)) throw new Error('mode: dry | apply | rollback');

function loadEnv() {
  const env = { ...process.env };
  const file = process.env.ENV_FILE;
  if (file && fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      env[line.slice(0, i)] ??= line.slice(i + 1).replace(/^"|"$/g, '');
    }
  }
  return env;
}
const env = loadEnv();
const base = String(env.ACADEMY_SUPABASE_URL || '').replace(/\/+$/, '');
const key = String(env.ACADEMY_SERVICE_ROLE_KEY || '');
if (!base || !key) throw new Error('ACADEMY_SUPABASE_URL / ACADEMY_SERVICE_ROLE_KEY belum diisi');
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

// Teks ASCII saja (tanpa tanda kutip melengkung, panah, atau simbol) supaya persona tidak berisi karakter aneh.
// Angka promo ongkir dan harga cover TIDAK ditulis mati: persona memakai <...> yang diisi dari STATUS PROMO / cari_produk.
const COVER_SECTION = [
  '## Tawaran cover hanger (berbayar, SATU kali)',
  '',
  'Cover + Hanger dijual per set (harga dari `cari_produk` kategori Cover & Hanger, jangan diketik dari ingatan). Thobe dan Kandora memakai "Cover Thobe + Hanger", Koko memakai "Cover Koko + Hanger".',
  'Kapan: size sudah disetujui dan barang ready, SEBELUM minta nama/alamat (langkah 3b). Balasan itu hanya berisi tawaran (satu pertanyaan). Tawarkan HANYA kalau salah satu terpenuhi: (a) customer LAMA (`cek_pesanan` menemukan pesanan Selesai/Dikirim/Diproses), atau (b) STATUS PROMO menyatakan Free Cover Hanger TIDAK BERLAKU (berlaku untuk semua customer, baru maupun lama). Customer baru yang berhak bonus gratis: jangan tawarkan versi berbayar. Stok varian cover itu harus ada (`cari_produk`); kalau 0, jangan tawarkan.',
  'Jangan tawarkan kalau customer ragu harga/bilang mahal, sedang komplain/tukar size/tanya resi, terburu-buru, sudah menolak, atau sudah pesan cover.',
  '1. Tawar (Thobe/Kandora): "Mau sekalian tambah Cover + Hanger Thobe, Ka?" lalu baris kosong, lalu "Cukup <harga dari tool>, thobe jadi lebih rapi saat disimpan dan bagian bahunya tetap terjaga agar tidak mudah melar." Koko: "Mau sekalian tambah Cover + Hanger Koko, Ka?" lalu baris kosong, lalu "Cukup <harga dari tool>, kokonya jadi lebih rapi saat disimpan."',
  '2. Customer mau: masukkan sebagai barang pesanan (product_id cover-hanger, color "Cover Thobe + Hanger" atau "Cover Koko + Hanger", size ALL SIZE, quantity 1) di `cek_ongkir`, `rekap_pesanan`, dan `catat_closing` (items + baris `pesanan` mis. "Cover Thobe + Hanger x1 - Rp35.000"). Jangan menulisnya sebagai bonus atau gratis. Lanjut langkah 4.',
  '3. Customer menolak atau tidak menjawab: lanjut langkah 4, JANGAN ditawarkan lagi, dan kabak juga tidak ditawarkan (satu tawaran per percakapan).',
  'Larangan: menyebut cover ini gratis, menambah ke rincian tanpa customer bilang mau, klaim "paling laris" atau "tinggal sedikit", menyebut angka stok, menawarkan pelengkap lain bersamaan.',
  '',
].join('\n');

const SWAPS = [
  {
    lama: '\n## Alur closing',
    baru: '\n' + COVER_SECTION + '\n## Alur closing',
  },
  {
    lama: 'Selain yang tertulis BERLAKU tidak ada diskon atau bonus lain.',
    baru:
      'Promo ongkir yang tertulis BERLAKU ditonjolkan, jangan menunggu ditanya: begitu kota tujuan customer diketahui (atau customer menanyakan ongkir / ragu karena ongkir), buka dengan SATU kalimat kabar baik, lalu rincian dari cek_ongkir. ' +
      'Jabodetabek: "Kabar baik, Ka! Lagi ada Gratis Ongkir hingga <batas dari STATUS PROMO> untuk pengiriman Jabodetabek." ' +
      'Luar Jabodetabek: "Kabar baik, Ka! Ada Diskon Ongkir <persen dari STATUS PROMO> hingga <batas dari STATUS PROMO> untuk pengiriman ke luar Jabodetabek." ' +
      'Customer ragu karena ongkir: "Pas banget, Ka. Saat ini ada promo ongkir yang bisa bikin biaya pengiriman lebih hemat." ' +
      'Angka SELALU dari STATUS PROMO dan cek_ongkir, bukan dari contoh ini. Promo ongkir hanya untuk pesanan lewat chat WA dan checkout katalog website, bukan Open Order. ' +
      'Selain yang tertulis BERLAKU tidak ada diskon atau bonus lain.',
  },
];

const md5 = (text) => crypto.createHash('md5').update(text).digest('hex');
const count = (text, needle) => text.split(needle).length - 1;

const res = await fetch(`${base}/rest/v1/ai_settings?select=behavior,updated_at&id=eq.1`, { headers });
const rows = await res.json();
const behavior = rows?.[0]?.behavior;
const persona = behavior?.systemInstructions;
if (typeof persona !== 'string') throw new Error('persona tidak terbaca');
console.log(`persona sekarang: ${persona.length} karakter, md5 ${md5(persona)}, updated_at ${rows[0].updated_at}`);

const dari = mode === 'rollback' ? 'baru' : 'lama';
const ke = mode === 'rollback' ? 'lama' : 'baru';
let next = persona;
for (const [i, swap] of SWAPS.entries()) {
  const n = count(next, swap[dari]);
  if (n !== 1) {
    console.log(`BERHENTI: potongan ${i + 1} (${dari}) ditemukan ${n} kali, harus tepat 1. Tidak ada yang ditulis.`);
    process.exit(2);
  }
  next = next.replace(swap[dari], () => swap[ke]);
}
if (/[^\x00-\x7F]/.test(SWAPS.map((s) => s.baru).join(''))) throw new Error('teks pengganti memuat karakter non-ASCII');

console.log(`persona sesudah: ${next.length} karakter (${next.length - persona.length >= 0 ? '+' : ''}${next.length - persona.length}), md5 ${md5(next)}`);
for (const [i, swap] of SWAPS.entries()) {
  console.log(`\n--- potongan ${i + 1} ---\n- ${swap[dari].replace(/\n/g, '\n- ')}\n+ ${swap[ke].replace(/\n/g, '\n+ ')}`);
}

if (mode === 'dry') {
  console.log('\nDRY-RUN: tidak ada yang ditulis.');
  process.exit(0);
}

if (mode === 'apply') {
  // Cadangan berisi persona lengkap: simpan di luar repo (repo publik). Atur lewat BACKUP_FILE=...
  const backup = path.resolve(process.env.BACKUP_FILE || '20261127_persona_cover_promo_ongkir_backup.json');
  fs.writeFileSync(backup, JSON.stringify({ md5: md5(persona), updated_at: rows[0].updated_at, systemInstructions: persona }, null, 2));
  console.log(`\ncadangan persona lama: ${backup}`);
}

const patch = await fetch(`${base}/rest/v1/ai_settings?id=eq.1`, {
  method: 'PATCH',
  headers: { ...headers, Prefer: 'return=representation' },
  body: JSON.stringify({ behavior: { ...behavior, systemInstructions: next }, updated_at: new Date().toISOString() }),
});
const out = await patch.json();
if (!patch.ok) throw new Error(`gagal menulis: HTTP ${patch.status} ${JSON.stringify(out).slice(0, 300)}`);
const verify = out?.[0]?.behavior?.systemInstructions;
console.log(`\nterverifikasi di DB: ${verify === next ? 'SAMA dengan yang ditulis' : 'BEDA!'} (${verify?.length} karakter, md5 ${md5(String(verify))})`);
console.log(/Ã|Â|�/.test(String(verify)) ? 'PERINGATAN: ada karakter aneh' : 'tidak ada karakter aneh (Ã / Â)');
