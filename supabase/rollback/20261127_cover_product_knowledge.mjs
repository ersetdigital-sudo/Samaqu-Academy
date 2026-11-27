/**
 * Pengetahuan produk Cover & Hanger (Academy content_items p_cvh9a0b1c): hapus kalimat "gratis untuk pembelian pertama" yang di-hardcode (27 Nov 2026).
 *
 * PENGGANTIAN SEMPIT: dua kalimat di data produk Cover & Hanger (customerPitch dan characteristics) diganti; field lain tidak disentuh; sisa persona tidak disentuh.
 * Tiap potongan lama HARUS ada tepat satu kali, kalau tidak skrip berhenti tanpa menulis.
 *
 *   node supabase/rollback/20261127_cover_product_knowledge.mjs dry        # tampilkan diff, TIDAK menulis
 *   node supabase/rollback/20261127_cover_product_knowledge.mjs apply      # simpan cadangan lalu tulis
 *   node supabase/rollback/20261127_cover_product_knowledge.mjs rollback   # kembalikan potongan ke teks lama
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

const backupFile = process.env.BACKUP_FILE;
const ID = 'p_cvh9a0b1c';
// Teks ASCII saja. Status gratis/berbayar diatur STATUS PROMO + bagian "Tawaran cover hanger" di persona, bukan di data produk.
const SWAPS = [
  {
    field: 'customerPitch',
    lama: ' Untuk pembelian pertama, cover + hanger Thobe-nya gratis.',
    baru: '',
  },
  {
    field: 'characteristics',
    lama: 'Cover Thobe + Hanger gratis untuk pembelian pertama (promo resmi)',
    baru: 'Gratis atau berbayar mengikuti STATUS PROMO dan aturan Tawaran cover hanger; harga selalu dari cari_produk',
  },
];

const get = async (p) => (await fetch(`${base}/rest/v1/${p}`, { headers })).json();
const patch = async (p, body) => {
  const r = await fetch(`${base}/rest/v1/${p}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`PATCH ${p}: HTTP ${r.status} ${text.slice(0, 300)}`);
  // Tabel ini kadang membalas tanpa isi (204): hasil diverifikasi dengan membaca ulang, bukan dari balasan PATCH.
  return text ? JSON.parse(text) : [];
};
const count = (t, n) => t.split(n).length - 1;

const row = (await get(`content_items?select=id,data&id=eq.${ID}`))[0];
if (!row || typeof row.data !== 'object') throw new Error('baris produk tidak terbaca');
const data = row.data;

if (mode === 'rollback') {
  if (!backupFile || !fs.existsSync(backupFile)) throw new Error('BACKUP_FILE wajib untuk rollback');
  const b = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  await patch(`content_items?id=eq.${ID}`, { data: { ...data, customerPitch: b.customerPitch, characteristics: b.characteristics } });
  console.log('rollback selesai: customerPitch + characteristics dipulihkan');
  process.exit(0);
}

const next = { ...data };
for (const swap of SWAPS) {
  const cur = String(data[swap.field] ?? '');
  const n = count(cur, swap.lama);
  console.log(`${swap.field}: potongan lama ditemukan ${n} kali (harus 1)`);
  if (n !== 1) {
    console.log('BERHENTI: tidak ada yang ditulis.');
    process.exit(2);
  }
  next[swap.field] = cur.replace(swap.lama, () => swap.baru);
  console.log(`\n--- ${swap.field} ---\n- ${cur.replace(/\n/g, '\n- ')}\n+ ${next[swap.field].replace(/\n/g, '\n+ ')}`);
}
if (/[^\x00-\x7F]/.test(SWAPS.map((x) => x.baru).join(''))) throw new Error('teks pengganti memuat karakter non-ASCII');

if (mode === 'dry') {
  console.log('\nDRY-RUN: tidak ada yang ditulis.');
  process.exit(0);
}

if (!backupFile) throw new Error('BACKUP_FILE wajib untuk apply (simpan di luar repo)');
fs.writeFileSync(backupFile, JSON.stringify({ id: ID, customerPitch: data.customerPitch, characteristics: data.characteristics }, null, 2));
console.log(`\ncadangan: ${backupFile}`);
await patch(`content_items?id=eq.${ID}`, { data: next });
const v = (await get(`content_items?select=id,data&id=eq.${ID}`))[0]?.data;
const ok = v && v.customerPitch === next.customerPitch && v.characteristics === next.characteristics;
console.log(`terverifikasi di DB: ${ok ? 'SAMA dengan yang ditulis' : 'BEDA!'}`);
console.log(`sisa kata "gratis" di customerPitch: ${/gratis/i.test(String(v?.customerPitch)) ? 'ADA' : 'tidak ada'}; field lain tidak diubah: ${Object.keys(data).every((k) => k === 'customerPitch' || k === 'characteristics' ? true : JSON.stringify(v?.[k]) === JSON.stringify(data[k])) ? 'ya' : 'TIDAK'}`);
