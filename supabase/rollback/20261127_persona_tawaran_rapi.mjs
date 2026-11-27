/**
 * Persona bot: aturan tawaran pelengkap dirapikan jadi tiga kasus bernomor, satu sumber aturan (27 Nov 2026).
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
 *   node supabase/rollback/20261127_persona_tawaran_rapi.mjs dry        # tampilkan diff, TIDAK menulis
 *   node supabase/rollback/20261127_persona_tawaran_rapi.mjs apply      # simpan cadangan (BACKUP_FILE) lalu tulis
 *   node supabase/rollback/20261127_persona_tawaran_rapi.mjs rollback   # pulihkan dari BACKUP_FILE (hanya kalau persona belum berubah lagi)
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
// Isi keputusan TIDAK berubah (free cover untuk customer baru, dua pilihan untuk customer lama / promo mati); hanya dirapikan
// jadi tiga kasus bernomor supaya model tidak salah baca. Satu sumber aturan: bagian "Tawaran cover hanger".
const COVER_SECTION = [
  '## Tawaran cover hanger (berbayar, SATU kali)',
  '',
  'Ini aturan LANGKAH 3b (tawaran pelengkap). Satu balasan, sekali per percakapan, setelah size disetujui dan sebelum minta nama/alamat.',
  'Siapkan dulu: `cek_pesanan` (customer lama atau baru) dan `cari_produk` (Cover & Hanger dan Kabak: harga + stok). Harga selalu dari tool, jangan diketik dari ingatan.',
  'Cover: Thobe dan Kandora = "Cover Thobe + Hanger", Koko = "Cover Koko + Hanger".',
  '',
  'Pilih SATU kasus:',
  '1. Customer BARU, STATUS PROMO Free Cover Hanger BERLAKU, stok cover ada: tulis "Pembelian pertama juga dapat free Cover + Hanger." lalu tawarkan kabak (bagian Tawaran kabak). Kabak tidak bisa (Kandora, Koko lengan pendek, stok 0): kalimat bonus saja, lalu lanjut langkah 4.',
  '2. Customer LAMA, ATAU STATUS PROMO Free Cover Hanger TIDAK BERLAKU (semua customer):',
  '   - cover dan kabak bisa: tanya dua pilihan (kalimat di bawah)',
  '   - hanya cover bisa (Kandora, Koko lengan pendek, stok kabak 0): tanya cover saja (kalimat di bawah)',
  '   - hanya kabak bisa (stok cover 0): tawaran kabak biasa (bagian Tawaran kabak)',
  '   - dua-duanya tidak bisa: lanjut langkah 4',
  '3. Selain itu (mis. customer baru tapi stok cover 0): tawaran kabak biasa tanpa kalimat bonus.',
  '',
  'Kalimat dua pilihan, Thobe: "Mau sekalian tambah Cover + Hanger Thobe atau Kabak-nya, Ka?" lalu baris kosong, lalu "Cover + Hanger <harga>, thobenya jadi lebih rapi saat disimpan dan bahunya tetap terjaga. Kabak <harga>, pelengkap manset thobenya."',
  'Koko: sama, tulis "Koko" dan tanpa soal bahu: "Cover + Hanger <harga>, kokonya jadi lebih rapi saat disimpan. Kabak <harga>, pelengkap manset kokonya."',
  'Cover saja: "Mau sekalian tambah Cover + Hanger Thobe, Ka?" lalu baris kosong, lalu "Cukup <harga>, thobe jadi lebih rapi saat disimpan dan bagian bahunya tetap terjaga agar tidak mudah melar." (Koko: "...Cover + Hanger Koko, Ka? Cukup <harga>, kokonya jadi lebih rapi saat disimpan.")',
  '',
  'Jangan tawarkan (langsung lanjut langkah 4) kalau customer ragu harga/bilang mahal, sedang komplain/tukar size/tanya resi, terburu-buru, sudah menolak, atau sudah pesan cover.',
  '',
  'Setelah customer menjawab:',
  '- pilih cover: masukkan sebagai barang pesanan (product_id cover-hanger, color varian cover, size ALL SIZE, quantity 1) di `cek_ongkir`, `rekap_pesanan`, dan `catat_closing` (baris `pesanan` mis. "Cover Thobe + Hanger x1 - Rp35.000"). Jangan menulisnya sebagai bonus atau gratis.',
  '- pilih kabak: ikuti butir 2-4 di bagian Tawaran kabak.',
  '- minta dua-duanya: masukkan keduanya.',
  '- menolak atau diam: lanjut langkah 4, JANGAN ditawarkan lagi (cover maupun kabak).',
  'Larangan: menyebut cover berbayar ini gratis, menambah ke rincian tanpa customer bilang mau, klaim "paling laris" atau "tinggal sedikit", menyebut angka stok, menawarkan pelengkap di luar cover dan kabak.',
  '',
].join('\n');

const KABAK_KAPAN_BARU =
  'Kapan: langkah 3b. Siapa yang ditawari kabak dan caranya: lihat bagian Tawaran cover hanger (kasus 1, 2, 3). Balasan itu hanya berisi tawaran (satu pertanyaan), jangan digabung dengan minta data.';
const LANGKAH_3B_BARU =
  '3b. TAWARAN PELENGKAP (satu kali per percakapan): setelah size disetujui, SEBELUM langkah 4. Panggil `cek_pesanan` dan `cari_produk` (cover dan kabak) dulu, lalu ikuti bagian Tawaran cover hanger (pilih satu dari tiga kasus). Jangan dilewati, kecuali ada alasan "Jangan tawarkan" di bagian itu.';

// ---------------------------------------------------------------- bantu
function replaceLine(text, linePrefix, baru, label, headingPrefix) {
  const parts = text.split(/^(?=## )/m);
  const idx = headingPrefix ? parts.findIndex((p) => p.startsWith(headingPrefix)) : -1;
  const scope = idx >= 0 ? parts[idx] : text;
  const lines = scope.split('\n');
  const hits = lines.map((l, i) => (l.startsWith(linePrefix) ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) throw new Error(`${label}: ditemukan ${hits.length} baris (harus 1)`);
  lines[hits[0]] = baru;
  const out = lines.join('\n');
  if (idx >= 0) {
    parts[idx] = out;
    return parts.join('');
  }
  return out;
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
  t = replaceLine(t, 'Kapan: langkah 3b, customer sudah setuju size thobe/Koko', KABAK_KAPAN_BARU, 'kabak: baris Kapan', '## Tawaran kabak');
  t = replaceSection(t, '## Tawaran cover hanger', COVER_SECTION + '\n', 'bagian cover');
  t = replaceLine(t, '3b. TAWARAN PELENGKAP', LANGKAH_3B_BARU, 'langkah 3b', '## Alur closing');
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
if (/[^\x00-\x7F]/.test([KABAK_KAPAN_BARU, COVER_SECTION, LANGKAH_3B_BARU].join(''))) throw new Error('teks pengganti memuat karakter non-ASCII');

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
