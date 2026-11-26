/**
 * Persona bot: kalimat promo yang di-hardcode diganti menjadi "ikuti blok STATUS PROMO" (26 Nov 2026).
 *
 * PENGGANTIAN SEMPIT: hanya tiga potongan teks di bagian "## Promo" yang diganti; sisa persona tidak disentuh.
 * Tiap potongan lama HARUS ada tepat satu kali, kalau tidak skrip berhenti tanpa menulis.
 *
 *   node supabase/rollback/20261126_persona_promo_status.mjs dry        # tampilkan diff, TIDAK menulis
 *   node supabase/rollback/20261126_persona_promo_status.mjs apply      # simpan cadangan lalu tulis
 *   node supabase/rollback/20261126_persona_promo_status.mjs rollback   # kembalikan tiga potongan ke teks lama
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
const SWAPS = [
  {
    lama: '## Promo (satu-satunya sumber aturan promo)',
    baru: '## Promo (satu-satunya sumber aturan promo; promo yang berlaku hari ini = blok STATUS PROMO)',
  },
  {
    lama: 'Satu-satunya promo: pembelian pertama dapat free cover + hanger thobe.',
    baru:
      'Hanya sebut promo yang tertulis BERLAKU di blok STATUS PROMO (tidak tertulis = tidak berlaku). ' +
      'Bonus pembelian pertama: free cover + hanger thobe, hanya kalau STATUS PROMO menyatakannya BERLAKU.',
  },
  {
    lama:
      'Selain itu tidak ada diskon, gratis ongkir, atau bonus lain. Ditanya diskon: belum ada,\n' +
      'tonjolkan keunggulan produk (+ promo kalau berhak).',
    baru:
      'Promo ongkir (gratis ongkir atau potongan ongkir) HANYA kalau STATUS PROMO menyatakannya BERLAKU; angka ongkir dan hemat berapa ' +
      'selalu dari cek_ongkir / rekap_pesanan, jangan dihitung sendiri. Selain yang tertulis BERLAKU tidak ada diskon atau bonus lain. ' +
      'Ditanya diskon: belum ada,\n' +
      'tonjolkan keunggulan produk (+ promo yang berlaku kalau berhak).',
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
  const backup = path.resolve(process.env.BACKUP_FILE || '20261126_persona_promo_status_backup.json');
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
