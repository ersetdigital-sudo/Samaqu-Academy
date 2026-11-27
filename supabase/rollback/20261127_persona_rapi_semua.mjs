/**
 * Persona bot: rapikan SEMUA bagian (27 Nov 2026): bagian Promo disusun ulang jadi blok A/B, baris panjang di semua bagian (kecuali Contoh gaya) dilipat seperti gaya persona lama.
 *
 * Aturan (keputusan bos):
 *  - Setelah size disetujui (langkah 3b), satu balasan, satu kali per percakapan.
 *  - Customer BARU yang berhak bonus: sebut "Pembelian pertama juga dapat free Cover + Hanger" lalu tawarkan kabak.
 *  - Customer LAMA, atau STATUS PROMO menyatakan Free Cover Hanger TIDAK BERLAKU (semua customer): satu pertanyaan
 *    "Cover + Hanger atau Kabak-nya?" (hanya yang memenuhi syarat), harga dari tool.
 *
 * ISI ATURAN TIDAK BERUBAH. Pengaman: (1) semua bagian selain Promo hanya dilipat barisnya, dan skrip memastikan teksnya sama persis setelah spasi/baris baru dipadatkan;
 * (2) bagian Promo disusun ulang, dan skrip memastikan semua nama tool (`...`) dan semua kalimat contoh ("...") di bagian lama masih ada di bagian baru;
 * (3) bagian "Contoh gaya" TIDAK disentuh sama sekali (balasan contoh bukan teks yang boleh dilipat). Pengaman lama: tiap potongan lama harus ada PERSIS satu kali (potongan di dalam satu bagian dicari
 * hanya di bagian itu), kalau tidak skrip berhenti tanpa menulis. Bagian lain persona tidak disentuh.
 *
 *   node supabase/rollback/20261127_persona_rapi_semua.mjs dry        # tampilkan diff, TIDAK menulis
 *   node supabase/rollback/20261127_persona_rapi_semua.mjs apply      # simpan cadangan (BACKUP_FILE) lalu tulis
 *   node supabase/rollback/20261127_persona_rapi_semua.mjs rollback   # pulihkan dari BACKUP_FILE (hanya kalau persona belum berubah lagi)
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
const PROMO_LINES = [
  '## Promo (satu-satunya sumber aturan promo; promo yang berlaku hari ini = blok STATUS PROMO)',
  '',
  'Aturan dasar: hanya sebut promo yang tertulis BERLAKU di blok STATUS PROMO. Tidak tertulis = tidak berlaku. Selain itu tidak ada diskon atau bonus lain. Ditanya diskon: "belum ada", lalu tonjolkan keunggulan produk (+ promo yang berlaku kalau berhak).',
  '',
  'A. Free Cover + Hanger (bonus pembelian pertama)',
  '- Boleh menulis/menyebut "free cover + hanger" di mana pun (obrolan, rincian, rekap, draft) HANYA kalau DUA-DUANYA terpenuhi:',
  '  1. Customer baru: `cek_pesanan` nomor WA customer tidak menemukan pesanan Selesai/Dikirim/Diproses (Dibatalkan tidak dihitung). Status lead TIDAK dipakai. Customer yang bilang pernah beli (mungkin lewat nomor lain): jangan janjikan.',
  '  2. STATUS PROMO menyatakan Free Cover Hanger BERLAKU, dan blok STATUS BONUS menyebut stok cover ADA (bukan HABIS / TIDAK TERBACA).',
  '- Di rekap pesanan, bonus sudah diputuskan `rekap_pesanan` (stok + customer baru): salin apa adanya. Aturan ini untuk obrolan sebelum rekap.',
  '- Berhak tapi stok habis: "Mohon maaf Ka, cover dan hanger sedang kosong", tanpa janji kapan, pesanan tetap jalan.',
  '- Customer lama menanyakan promo ini: oper ke admin.',
  '',
  'B. Promo ongkir (gratis ongkir atau potongan ongkir)',
  '- Hanya kalau STATUS PROMO menyatakan BERLAKU. Berlaku untuk pesanan lewat chat WA dan checkout katalog website, bukan Open Order.',
  '- Angka (persen, batas maksimal, tarif asli, hemat berapa, ongkir dibayar) SELALU dari STATUS PROMO dan `cek_ongkir` / `rekap_pesanan`, bukan dari contoh di bawah. Jangan dihitung sendiri. Sebut batas maksimal persis seperti tertulis; jangan menyebut gratis ongkir tanpa batas.',
  '- Tonjolkan, jangan menunggu ditanya: begitu kota tujuan customer diketahui (atau customer menanyakan ongkir / ragu karena ongkir), buka dengan SATU kalimat kabar baik, lalu rincian dari `cek_ongkir`:',
  '  - Jabodetabek: "Kabar baik, Ka! Lagi ada Gratis Ongkir hingga <batas dari STATUS PROMO> untuk pengiriman Jabodetabek."',
  '  - Luar Jabodetabek: "Kabar baik, Ka! Ada Diskon Ongkir <persen dari STATUS PROMO> hingga <batas dari STATUS PROMO> untuk pengiriman ke luar Jabodetabek."',
  '  - Customer ragu karena ongkir: "Pas banget, Ka. Saat ini ada promo ongkir yang bisa bikin biaya pengiriman lebih hemat."',
  '',
];

const WIDTH = 96;
const THRESHOLD = 110;

// Lipat satu baris panjang pada spasi, dengan indent lanjutan yang sama dengan penanda daftar ("- ", "1. ", "  - ").
function wrapLine(line) {
  if (line.length <= THRESHOLD) return line;
  const marker = line.match(/^(\s*(?:[-*]|\d+\.)\s+)/);
  const lead = marker ? marker[1] : line.match(/^\s*/)[0];
  const hang = ' '.repeat(lead.length);
  const words = line.slice(lead.length).split(' ');
  const out = [];
  let cur = lead;
  for (const w of words) {
    if (cur.trim().length > 0 && (cur + ' ' + w).length > WIDTH && cur !== lead) {
      out.push(cur);
      cur = hang + w;
    } else {
      cur = cur === lead || cur === hang ? cur + w : cur + ' ' + w;
    }
  }
  out.push(cur);
  return out.join('\n');
}
const wrapText = (text) => text.split('\n').map(wrapLine).join('\n');
const norm = (t) => t.replace(/\s+/g, ' ').trim();

function transform(persona) {
  const parts = persona.split(/^(?=## )/m);
  const out = [];
  for (const p of parts) {
    const title = p.split('\n')[0];
    if (title.startsWith('## Promo')) {
      const baru = wrapText(PROMO_LINES.join('\n')) + '\n';
      // pengaman isi: semua `tool` dan "kalimat contoh" di bagian lama harus masih ada di bagian baru
      const tokens = [...p.matchAll(/`[^`]+`|"[^"]+"/g)].map((m) => norm(m[0]));
      const baruN = norm(baru);
      const hilang = tokens.filter((t) => !baruN.includes(t));
      if (hilang.length) throw new Error(`bagian Promo: token hilang: ${hilang.join(' | ')}`);
      out.push(baru);
    } else if (title.startsWith('## Contoh gaya')) {
      out.push(p);
    } else {
      const baru = wrapText(p);
      if (norm(baru) !== norm(p)) throw new Error(`isi bagian "${title}" berubah setelah dilipat`);
      out.push(baru);
    }
  }
  return out.join('');
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
if (/[^\x00-\x7F]/.test(PROMO_LINES.join(''))) throw new Error('teks pengganti memuat karakter non-ASCII');

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
