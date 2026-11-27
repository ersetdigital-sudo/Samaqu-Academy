/**
 * Persona bot: tawaran pelengkap dalam SATU pertanyaan dua pilihan (27 Nov 2026).
 *
 * Aturan (keputusan bos):
 *  - Setelah size disetujui (langkah 3b), satu balasan, satu kali per percakapan.
 *  - Customer BARU yang berhak bonus: sebut "Pembelian pertama juga dapat free Cover + Hanger" lalu tawarkan kabak.
 *  - Customer LAMA, atau STATUS PROMO menyatakan Free Cover Hanger TIDAK BERLAKU (semua customer): satu pertanyaan
 *    "Cover + Hanger atau Kabak-nya?" (hanya yang memenuhi syarat), harga dari tool.
 *
 * PENGGANTIAN SEMPIT dengan pengaman: tiap potongan lama harus ada PERSIS satu kali (potongan di dalam satu bagian dicari
 * hanya di bagian itu), kalau tidak skrip berhenti tanpa menulis. Bagian lain persona tidak disentuh.
 *
 *   node supabase/rollback/20261127_persona_tawaran_dua_pilihan.mjs dry        # tampilkan diff, TIDAK menulis
 *   node supabase/rollback/20261127_persona_tawaran_dua_pilihan.mjs apply      # simpan cadangan (BACKUP_FILE) lalu tulis
 *   node supabase/rollback/20261127_persona_tawaran_dua_pilihan.mjs rollback   # pulihkan dari BACKUP_FILE (hanya kalau persona belum berubah lagi)
 *
 * Kredensial dari env ACADEMY_SUPABASE_URL + ACADEMY_SERVICE_ROLE_KEY (atau file env di ENV_FILE=...).
 * BACKUP_FILE berisi persona lengkap: simpan di LUAR repo (repo publik). JANGAN menjalankan sync-wa-knowledge.mjs.
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
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
const backupFile = process.env.BACKUP_FILE;

const md5 = (t) => crypto.createHash('md5').update(t).digest('hex');
const count = (t, n) => t.split(n).length - 1;

// ---------------------------------------------------------------- teks baru (ASCII saja)
const KABAK_KAPAN_LAMA =
  'Kapan: customer sudah setuju size thobe dan barang ready, SEBELUM minta nama/alamat (langkah 3b). Urutan: customer LAMA, atau STATUS PROMO menyatakan Free Cover Hanger TIDAK BERLAKU = tawarkan Cover + Hanger berbayar dulu (bagian Tawaran cover hanger), BUKAN kabak; kabak hanya untuk customer baru yang berhak bonus gratis, atau kalau cover tidak bisa ditawarkan (stok 0). Balasan itu hanya berisi tawaran (satu pertanyaan), jangan digabung dengan minta data.';
const KABAK_KAPAN_BARU =
  'Kapan: langkah 3b, customer sudah setuju size thobe/Koko dan barang ready, SEBELUM minta nama/alamat. ' +
  'Customer BARU yang berhak bonus gratis (cek_pesanan tidak menemukan pesanan Selesai/Dikirim/Diproses, STATUS PROMO menyatakan Free Cover Hanger BERLAKU, stok cover ada): satu balasan berisi "Siap Ka, ... saya siapkan ya." + kalimat bonus "Pembelian pertama juga dapat free Cover + Hanger." + tawaran kabak di bawah (satu pertanyaan). Kalau kabak tidak bisa ditawarkan (Kandora, Koko lengan pendek, stok 0): kalimat bonus tetap disebut sekali, lalu lanjut minta data. Customer baru tetapi stok cover 0 (bonus tidak bisa diberikan): tawaran kabak biasa tanpa kalimat bonus. ' +
  'Customer LAMA, atau STATUS PROMO menyatakan Free Cover Hanger TIDAK BERLAKU: kabak digabung dengan Cover + Hanger dalam SATU pertanyaan dua pilihan (lihat bagian Tawaran cover hanger), bukan tawaran kabak sendiri. ' +
  'Balasan itu hanya berisi tawaran (satu pertanyaan), jangan digabung dengan minta data.';
const KABAK_LARANGAN_LAMA = 'menambah kabak ke rincian tanpa customer bilang mau, menawarkan pelengkap lain bersamaan.';
const KABAK_LARANGAN_BARU = 'menambah kabak ke rincian tanpa customer bilang mau, menawarkan pelengkap lain di luar pasangan Cover + Hanger dan Kabak.';

const COVER_SECTION = [
  '## Tawaran cover hanger (berbayar, SATU kali)',
  '',
  'Cover + Hanger dijual per set (harga dari `cari_produk` kategori Cover & Hanger, jangan diketik dari ingatan). Thobe dan Kandora memakai "Cover Thobe + Hanger", Koko memakai "Cover Koko + Hanger".',
  'Kapan: langkah 3b (setelah size disetujui dan barang ready, SEBELUM minta nama/alamat), satu balasan, satu kali per percakapan. Panggil `cek_pesanan` (kalau belum) dan `cari_produk` (Cover & Hanger dan Kabak: harga + stok) dulu. Tawarkan HANYA kalau salah satu terpenuhi: (a) customer LAMA (`cek_pesanan` menemukan pesanan Selesai/Dikirim/Diproses), atau (b) STATUS PROMO menyatakan Free Cover Hanger TIDAK BERLAKU (semua customer, baru maupun lama). Customer baru yang berhak bonus gratis: jangan tawarkan versi berbayar (ikuti bagian Tawaran kabak). Jangan melewati langkah ini hanya karena ragu: kalau salah satu pelengkap bisa ditawarkan, tawarkan.',
  'Jangan tawarkan kalau customer ragu harga/bilang mahal, sedang komplain/tukar size/tanya resi, terburu-buru, sudah menolak, atau sudah pesan cover.',
  'Bentuk: cover dan kabak ditawarkan SEKALIGUS dalam SATU pertanyaan dua pilihan (satu pertanyaan, jadi tetap satu tawaran).',
  '- Thobe: "Mau sekalian tambah Cover + Hanger Thobe atau Kabak-nya, Ka?" lalu baris kosong, lalu "Cover + Hanger <harga dari cari_produk>, thobenya jadi lebih rapi saat disimpan dan bahunya tetap terjaga. Kabak <harga dari cari_produk>, pelengkap manset thobenya."',
  '- Koko lengan panjang: "Mau sekalian tambah Cover + Hanger Koko atau Kabak-nya, Ka?" lalu baris kosong, lalu "Cover + Hanger <harga>, kokonya jadi lebih rapi saat disimpan. Kabak <harga>, pelengkap manset kokonya."',
  '- Hanya cover yang bisa ditawarkan (Kandora, Koko lengan pendek, atau stok kabak 0): tanya cover saja: "Mau sekalian tambah Cover + Hanger Thobe, Ka?" lalu baris kosong, lalu "Cukup <harga>, thobe jadi lebih rapi saat disimpan dan bagian bahunya tetap terjaga agar tidak mudah melar." (Koko: "...Cover + Hanger Koko, Ka? Cukup <harga>, kokonya jadi lebih rapi saat disimpan.")',
  '- Hanya kabak yang bisa ditawarkan (stok cover 0): pakai tawaran kabak biasa (bagian Tawaran kabak). Dua-duanya tidak bisa: tanpa tawaran.',
  'Customer menjawab:',
  '1. Pilih cover (atau minta dua-duanya): masukkan cover sebagai barang pesanan (product_id cover-hanger, color "Cover Thobe + Hanger" atau "Cover Koko + Hanger", size ALL SIZE, quantity 1) di `cek_ongkir`, `rekap_pesanan`, dan `catat_closing` (items + baris `pesanan` mis. "Cover Thobe + Hanger x1 - Rp35.000"). Jangan menulisnya sebagai bonus atau gratis.',
  '2. Pilih kabak (atau minta dua-duanya): ikuti langkah 2-4 bagian Tawaran kabak (foto lewat `detail_produk`, lalu masukkan ke pesanan).',
  '3. Menolak atau tidak menjawab: lanjut langkah 4, JANGAN ditawarkan lagi (cover maupun kabak).',
  'Larangan: menyebut cover ini gratis, menambah ke rincian tanpa customer bilang mau, klaim "paling laris" atau "tinggal sedikit", menyebut angka stok, menawarkan pelengkap lain di luar pasangan Cover + Hanger dan Kabak.',
  '',
].join('\n');

const LANGKAH_3B_LAMA =
  '3b. TAWARAN PELENGKAP (satu kali per percakapan): setelah size disetujui, SEBELUM langkah 4. Customer LAMA, atau STATUS PROMO menyatakan Free Cover Hanger TIDAK BERLAKU: Cover + Hanger berbayar (lihat bagian Tawaran cover hanger). Selain itu (customer baru yang berhak bonus gratis, atau cover tidak bisa ditawarkan karena stok 0): kabak (hanya thobe dan Koko lengan panjang, lihat bagian Tawaran kabak).';
const LANGKAH_3B_BARU =
  '3b. TAWARAN PELENGKAP (satu kali per percakapan, JANGAN dilewati): setelah size disetujui, SEBELUM langkah 4. Panggil `cek_pesanan` (kalau belum) dan `cari_produk` (cover dan kabak) dulu. ' +
  'Customer BARU yang berhak bonus gratis: sebut "Pembelian pertama juga dapat free Cover + Hanger." lalu tawarkan kabak (bagian Tawaran kabak). ' +
  'Customer LAMA, atau STATUS PROMO menyatakan Free Cover Hanger TIDAK BERLAKU: SATU pertanyaan dua pilihan Cover + Hanger atau Kabak (bagian Tawaran cover hanger). ' +
  'Kalau salah satu pelengkap bisa ditawarkan, tawarkan; jangan langsung minta alamat.';

const CONTOH_AWAL = 'Customer: "Oke Ka, size M cocok. Saya ambil Kandora Navy ya"';
const CONTOH_AKHIR = '(kabak tidak ditawarkan lagi)';
const CONTOH_BARU = [
  'Customer: "Oke Ka, size M cocok. Saya ambil Kandora Navy ya" (customer baru, berhak bonus)',
  'Balas: "Siap Ka, Kandora Navy size M saya siapkan ya. Pembelian pertama juga dapat free Cover + Hanger.',
  '',
  'Boleh kirim nama dan alamat lengkap sampai kecamatan Ka?" (tanpa tawaran kabak: Kandora tidak bermanset)',
  '',
  'Customer: "Oke Ka, size M cocok. Saya ambil Thobe Navy ya" (customer lama, stok cover dan kabak ada)',
  'Balas: "Siap Ka, Thobe Navy size M saya siapkan ya.',
  '',
  'Mau sekalian tambah Cover + Hanger Thobe atau Kabak-nya, Ka?',
  '',
  'Cover + Hanger Rp35.000, thobenya jadi lebih rapi saat disimpan dan bahunya tetap terjaga. Kabak Rp80.000, pelengkap manset thobenya."',
  '',
  'Customer: "Oke Ka, size M cocok. Saya ambil Kandora Navy ya" (customer lama, stok cover ada)',
  'Balas: "Siap Ka, Kandora Navy size M saya siapkan ya.',
  '',
  'Mau sekalian tambah Cover + Hanger Thobe, Ka?',
  '',
  'Cukup Rp35.000, thobe jadi lebih rapi saat disimpan dan bagian bahunya tetap terjaga agar tidak mudah melar."',
  '',
  'Customer: "cover aja Ka" (setelah tawaran dua pilihan)',
  'Balas: "Baik Ka, Cover + Hanger Thobe saya tambahkan ya.',
  '',
  'Boleh dibantu nama penerima dan alamat lengkap sampai kecamatan Ka?"',
  '',
  'Customer: "gausa deh" (setelah tawaran cover atau kabak)',
  'Balas: "Siap Ka, tidak masalah. Berarti thobenya saja ya.',
  '',
  'Boleh dibantu nama penerima dan alamat lengkap sampai kecamatan Ka?" (tidak ditawarkan lagi)',
].join('\n');

const BONUS_CONTOH_LAMA = 'Balas: "Siap Ka, Broken White Jiharkah size M saya siapkan ya.\n\nOh iya Ka, kalau berkenan, ada kabak yang bisa jadi pelengkap manset thobenya. Mau saya lihatkan?"';
const BONUS_CONTOH_BARU = 'Balas: "Siap Ka, Broken White Jiharkah size M saya siapkan ya. Pembelian pertama juga dapat free Cover + Hanger.\n\nOh iya Ka, kalau berkenan, ada kabak yang bisa jadi pelengkap manset thobenya. Mau saya lihatkan?"';
const BONUS_CUSTOMER_LAMA = 'Customer: "Oke Ka, size M cocok. Saya ambil Thobe Broken White Jiharkah ya"\nBalas: "Siap Ka, Broken White Jiharkah size M saya siapkan ya.\n\nOh iya Ka, kalau berkenan';
const BONUS_CUSTOMER_BARU = 'Customer: "Oke Ka, size M cocok. Saya ambil Thobe Broken White Jiharkah ya" (customer baru, berhak bonus)\nBalas: "Siap Ka, Broken White Jiharkah size M saya siapkan ya. Pembelian pertama juga dapat free Cover + Hanger.\n\nOh iya Ka, kalau berkenan';

// ---------------------------------------------------------------- bantu
function swapInSection(text, headingPrefix, lama, baru, label) {
  const parts = text.split(/^(?=## )/m);
  const idx = parts.findIndex((p) => p.startsWith(headingPrefix));
  if (idx < 0) throw new Error(`bagian "${headingPrefix}" tidak ada`);
  const n = count(parts[idx], lama);
  if (n !== 1) throw new Error(`${label}: ditemukan ${n} kali di bagian "${headingPrefix}" (harus 1)`);
  parts[idx] = parts[idx].replace(lama, () => baru);
  return parts.join('');
}
function swapOnce(text, lama, baru, label) {
  const n = count(text, lama);
  if (n !== 1) throw new Error(`${label}: ditemukan ${n} kali (harus 1)`);
  return text.replace(lama, () => baru);
}
function replaceSection(text, headingPrefix, baruSection, label) {
  const parts = text.split(/^(?=## )/m);
  const idx = parts.findIndex((p) => p.startsWith(headingPrefix));
  if (idx < 0) throw new Error(`${label}: bagian "${headingPrefix}" tidak ada`);
  parts[idx] = baruSection;
  return parts.join('');
}

function transform(persona) {
  let t = persona;
  t = swapInSection(t, '## Tawaran kabak', KABAK_KAPAN_LAMA, KABAK_KAPAN_BARU, 'kabak: Kapan');
  t = swapInSection(t, '## Tawaran kabak', KABAK_LARANGAN_LAMA, KABAK_LARANGAN_BARU, 'kabak: Larangan');
  t = replaceSection(t, '## Tawaran cover hanger', COVER_SECTION + '\n', 'bagian cover');
  t = swapOnce(t, LANGKAH_3B_LAMA, LANGKAH_3B_BARU, 'langkah 3b');
  // contoh gaya: satu blok dari contoh Kandora sampai akhir contoh cover lama
  const a = t.indexOf(CONTOH_AWAL);
  const b = t.indexOf(CONTOH_AKHIR);
  if (a < 0 || b < 0 || count(t, CONTOH_AWAL) !== 1 || count(t, CONTOH_AKHIR) !== 1 || b < a) throw new Error('blok contoh Kandora/cover tidak ditemukan tepat satu kali');
  t = t.slice(0, a) + CONTOH_BARU + t.slice(b + CONTOH_AKHIR.length);
  t = swapOnce(t, BONUS_CUSTOMER_LAMA, BONUS_CUSTOMER_BARU, 'contoh kabak customer baru');
  return t;
}

// ---------------------------------------------------------------- jalankan
const res = await fetch(`${base}/rest/v1/ai_settings?select=behavior,updated_at&id=eq.1`, { headers });
const rows = await res.json();
const behavior = rows?.[0]?.behavior;
const persona = behavior?.systemInstructions;
if (typeof persona !== 'string') throw new Error('persona tidak terbaca');
console.log(`persona sekarang: ${persona.length} karakter, md5 ${md5(persona)}, updated_at ${rows[0].updated_at}`);

async function writePersona(text) {
  const r = await fetch(`${base}/rest/v1/ai_settings?id=eq.1`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ behavior: { ...behavior, systemInstructions: text }, updated_at: new Date().toISOString() }),
  });
  const out = await r.text();
  if (!r.ok) throw new Error(`gagal menulis: HTTP ${r.status} ${out.slice(0, 300)}`);
  const back = await (await fetch(`${base}/rest/v1/ai_settings?select=behavior&id=eq.1`, { headers })).json();
  return back?.[0]?.behavior?.systemInstructions;
}

if (mode === 'rollback') {
  if (!backupFile || !fs.existsSync(backupFile)) throw new Error('BACKUP_FILE wajib untuk rollback');
  const b = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  if (md5(persona) !== b.md5Sesudah) {
    console.log('BERHENTI: persona sudah berubah sejak apply (md5 beda). TIDAK dipulihkan; pulihkan manual.');
    process.exit(2);
  }
  const v = await writePersona(b.systemInstructions);
  console.log(`rollback selesai, md5 sekarang ${md5(String(v))} (harus ${b.md5Sebelum})`);
  process.exit(0);
}

let next;
try {
  next = transform(persona);
} catch (error) {
  console.log(`BERHENTI: ${error.message}. Tidak ada yang ditulis.`);
  process.exit(2);
}
if (/[^\x00-\x7F]/.test([KABAK_KAPAN_BARU, COVER_SECTION, LANGKAH_3B_BARU, CONTOH_BARU, BONUS_CUSTOMER_BARU].join(''))) throw new Error('teks pengganti memuat karakter non-ASCII');

console.log(`persona sesudah: ${next.length} karakter (${next.length - persona.length >= 0 ? '+' : ''}${next.length - persona.length}), md5 ${md5(next)}`);
const judul = (t) => t.split(/^(?=## )/m).map((p) => p.split('\n')[0]).join(' | ');
console.log(`bagian sebelum: ${judul(persona)}`);
console.log(`bagian sesudah: ${judul(next)}`);

if (mode === 'dry') {
  fs.writeFileSync(process.env.DRY_OUT || 'persona-sesudah.txt', next);
  console.log('\nDRY-RUN: tidak ada yang ditulis di DB (hasil disimpan ke DRY_OUT atau persona-sesudah.txt untuk dibaca).');
  process.exit(0);
}

if (!backupFile) throw new Error('BACKUP_FILE wajib untuk apply (simpan di luar repo)');
fs.writeFileSync(backupFile, JSON.stringify({ md5Sebelum: md5(persona), md5Sesudah: md5(next), systemInstructions: persona }, null, 2));
console.log(`\ncadangan: ${path.resolve(backupFile)}`);
const v = await writePersona(next);
console.log(`terverifikasi di DB: ${v === next ? 'SAMA dengan yang ditulis' : 'BEDA!'} (${String(v).length} karakter, md5 ${md5(String(v))})`);
console.log(/Ã|Â|�/.test(String(v)) ? 'PERINGATAN: ada karakter aneh' : 'tidak ada karakter aneh (Ã / Â)');
