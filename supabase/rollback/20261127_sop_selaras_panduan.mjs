/**
 * Selaraskan SOP lama dengan Panduan Admin (27 Nov 2026). Hanya penggantian sempit pada field yang bentrok;
 * "Leader" menjadi "kepala staff admin" di 6 SOP halaman SOP. Jumlah kemunculan tiap potongan lama harus
 * PERSIS seperti yang diharapkan, kalau tidak skrip berhenti tanpa menulis apa pun.
 *
 *   node supabase/rollback/20261127_sop_selaras_panduan.mjs dry        # tampilkan sebelum/sesudah, TIDAK menulis
 *   node supabase/rollback/20261127_sop_selaras_panduan.mjs apply      # simpan cadangan (BACKUP_FILE) lalu tulis
 *   node supabase/rollback/20261127_sop_selaras_panduan.mjs rollback   # pulihkan dari BACKUP_FILE
 *
 * Memakai Supabase CLI yang sudah login (npx supabase db query), tanpa membaca kunci dari disk.
 * BACKUP_FILE simpan di LUAR repo. Tidak menyentuh persona, ai_settings, memory_items, atau materi.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const mode = process.argv[2] || 'dry';
if (!['dry', 'apply', 'rollback'].includes(mode)) throw new Error('mode: dry | apply | rollback');
const REF = 'rbjxjdgqtcwwbvuwtlpg';
const backupFile = process.env.BACKUP_FILE;

function cli(args) {
  const out = execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'db', 'query', `--remote=${REF}`, ...args], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const start = out.indexOf('{');
  return JSON.parse(out.slice(start));
}
const readRows = (ids) =>
  cli(['--read-only', '-f', writeTmp(`select id, data from content_items where id in (${ids.map((i) => `'${i}'`).join(',')}) order by id;`)]).rows;

const count = (t, n) => t.split(n).length - 1;
/** Ganti satu potongan teks; wajib muncul tepat `times` kali. */
function swap(text, from, to, times = 1) {
  const n = count(text, from);
  if (n !== times) throw new Error(`potongan lama muncul ${n}x (harus ${times}x): ${from.slice(0, 70)}`);
  return text.split(from).join(to);
}
/** "Leader" -> "kepala staff admin" (huruf besar di awal kalimat). */
function leaderToKsa(text) {
  return text.replace(/(^|[.!?"“]\s*|\n)Leader\b/g, '$1Kepala staff admin').replace(/\bLeader\b/g, 'kepala staff admin');
}
const mapStrings = (v, fn) => (typeof v === 'string' ? fn(v) : Array.isArray(v) ? v.map((x) => mapStrings(x, fn)) : v);

const EDITS = {
  sop_chat_pertama: (d) => {
    d.steps = d.steps.map((s) => {
      if (s.startsWith('Sapa dengan hangat')) return swap(s, 'Sapa dengan hangat dan sebut nama customer bila tersedia: "Halo, Kak [Nama] 😊".', 'Sapa customer dengan "Ka", sebut nama bila tersedia, tanpa emoji: "Halo, Ka [Nama]."');
      if (s.startsWith('Bila perlu data')) return swap(s, 'tanyakan maksimal dua hal sekaligus agar tidak memberondong.', 'tanyakan satu pertanyaan per giliran agar tidak memberondong.');
      if (s.startsWith('Tutup dengan')) return swap(s, 'Ada lagi yang bisa kami bantu, Kak?', 'Ada lagi yang bisa saya bantu, Ka?');
      return s;
    });
    d.notes = swap(d.notes, 'Gunakan "Kak" dan "Kami", bukan "Anda" atau "saya".', 'Sapa customer dengan "Ka" dan sebut diri "saya", bukan "Anda". Tanpa emoji.');
    return d;
  },
  flow_5: (d) => {
    d.example = swap(d.example, ' Pembelian pertama dapat free cover + hanger juga', '');
    d.steps = d.steps.map((s) =>
      s.startsWith('Cek ongkir J&T') ? swap(s, 'beserta totalnya', 'beserta totalnya. Sebut promo ongkir hanya bila hasil cek menampilkannya, dengan angka persis dari hasil cek') : s,
    );
    return d;
  },
  flow_4: (d) => {
    d.steps = d.steps.map((s) =>
      s.startsWith('Sampaikan promo resmi')
        ? 'Jangan menawarkan pelengkap saat customer masih ragu harga. Setelah size cocok dan customer memutuskan, tawarkan satu kali: customer baru yang berhak, sebut free Cover + Hanger lalu tawarkan Kabak. Customer lama atau free cover tidak berlaku, beri pilihan Cover + Hanger atau Kabak'
        : s,
    );
    if (!d.steps.some((s) => s.startsWith('Jangan menawarkan pelengkap'))) throw new Error('flow_4: langkah promo resmi tidak ditemukan');
    d.avoid = [...d.avoid, 'Menawarkan Cover + Hanger atau Kabak saat customer masih ragu harga atau buru-buru'];
    return d;
  },
  scr_mwbgcezltav6: (d) => {
    d.notes = `${d.notes}\nFree cover tidak ditulis di invoice, termasuk Rp0. Free cover diisi sebagai diskon saat review pesanan.`;
    return d;
  },
  scr_seed6: (d) => {
    d.response = swap(d.response, 'Bonus: Cover Thobe + Hanger (gratis, pembelian pertama)\n\n', '');
    d.notes = `${d.notes} Free cover tidak ditulis di rincian atau invoice, termasuk Rp0.`;
    return d;
  },
  prb_exchange: (d) => {
    d.escalation = swap(d.escalation, 'supervisor', 'kepala staff admin');
    d.process = [...d.process, 'Tukar ukuran boleh, ongkir kirim balik ditanggung customer'];
    d.example = swap(d.example, 'Bisa kami bantu cek, Kak 😊', 'Bisa saya bantu cek, Ka.');
    d.example = swap(d.example, 'Kami cek ketentuan tukar', 'Saya cek ketentuan tukar');
    return d;
  },
  // 5 SOP di bawah hanya ganti "Leader" -> "kepala staff admin"
  sop_followup_belum_bayar: null,
  sop_klaim_cacat: null,
  sop_komplain_terlambat: null,
  sop_tukar_ukuran_retur: null,
  sop_eskalasi_leader: null,
};
const LEADER_COUNT = { sop_eskalasi_leader: 4, sop_followup_belum_bayar: 1, sop_klaim_cacat: 2, sop_komplain_terlambat: 2, sop_tukar_ukuran_retur: 1 };
const ids = Object.keys(EDITS);

function buildNew(id, oldData) {
  let d = structuredClone(oldData);
  if (EDITS[id]) d = EDITS[id](d);
  if (id in LEADER_COUNT) {
    const before = JSON.stringify(d).split('Leader').length - 1;
    if (before !== LEADER_COUNT[id]) throw new Error(`${id}: "Leader" muncul ${before}x (harus ${LEADER_COUNT[id]}x)`);
    for (const k of Object.keys(d)) if (k !== 'title') d[k] = mapStrings(d[k], leaderToKsa);
    if (id === 'sop_eskalasi_leader') d.title = swap(d.title, 'Leader', 'Kepala Staff Admin');
    if (JSON.stringify(d).includes('Leader')) throw new Error(`${id}: masih ada "Leader"`);
  }
  d.updatedAt = Date.now();
  return d;
}

const q = (obj) => {
  const s = JSON.stringify(obj);
  if (s.includes('$j$')) throw new Error('teks memuat $j$');
  return `$j$${s}$j$::jsonb`;
};
function updateSql(pairs) {
  return pairs
    .map(({ id, from, to }) => `update content_items set data = ${q(to)}, updated_at = now() where id = '${id}' and data = ${q(from)} returning id;`)
    .join('\n');
}
function runUpdates(pairs) {
  const out = cli(['--yes', '-f', writeTmp(updateSql(pairs))]);
  const got = new Set(out.rows?.map((r) => r.id));
  return got;
}
function writeTmp(sql) {
  const p = `${process.env.TEMP || '.'}/sop-selaras-${Date.now()}.sql`;
  fs.writeFileSync(p, sql);
  return p;
}

const rows = readRows(ids);
if (rows.length !== ids.length) throw new Error(`terbaca ${rows.length} baris, harus ${ids.length}`);

if (mode === 'rollback') {
  if (!backupFile || !fs.existsSync(backupFile)) throw new Error('BACKUP_FILE wajib untuk rollback');
  const b = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  const pairs = b.map(({ id, sebelum, sesudah }) => ({ id, from: sesudah, to: sebelum }));
  // Hanya baris yang masih sama dengan hasil apply yang dipulihkan.
  const cli1 = cli(['--yes', '-f', writeTmp(updateSql(pairs))]);
  console.log(`rollback: ${cli1.rows?.length ?? 0}/${pairs.length} baris dipulihkan`);
  process.exit(0);
}

const pairs = rows.map((r) => ({ id: r.id, from: r.data, to: buildNew(r.id, r.data) }));
for (const { id, from, to } of pairs) {
  console.log(`\n=== ${id} ===`);
  for (const k of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (k === 'updatedAt') continue;
    const a = JSON.stringify(from[k]);
    const b = JSON.stringify(to[k]);
    if (a === b) continue;
    if (Array.isArray(from[k]) && Array.isArray(to[k])) {
      from[k].forEach((x, i) => { if (x !== to[k][i]) console.log(`- ${k}[${i}]: ${x}\n+ ${k}[${i}]: ${to[k][i]}`); });
      to[k].slice(from[k].length).forEach((x, i) => console.log(`+ ${k}[+${i}]: ${x}`));
    } else console.log(`- ${k}: ${from[k]}\n+ ${k}: ${to[k]}`);
  }
}

if (mode === 'dry') {
  console.log('\nDRY-RUN: tidak ada yang ditulis.');
  process.exit(0);
}

if (!backupFile) throw new Error('BACKUP_FILE wajib untuk apply (simpan di luar repo)');
fs.writeFileSync(backupFile, JSON.stringify(pairs.map(({ id, from, to }) => ({ id, sebelum: from, sesudah: to })), null, 2));
console.log(`\ncadangan: ${backupFile}`);
const got = runUpdates(pairs);
console.log(`tertulis: ${got.size}/${pairs.length} baris`);
const after = readRows(ids);
const bad = after.filter((r) => JSON.stringify(r.data) !== JSON.stringify(pairs.find((p) => p.id === r.id).to));
console.log(bad.length ? `PERINGATAN: ${bad.length} baris beda dari yang ditulis: ${bad.map((r) => r.id).join(', ')}` : 'terverifikasi: semua baris sama dengan yang ditulis');
const left = after.filter((r) => /Leader/.test(JSON.stringify(r.data)));
console.log(left.length ? `masih ada "Leader" di: ${left.map((r) => r.id).join(', ')}` : 'tidak ada "Leader" tersisa di 6 SOP');
console.log(/Ã|Â|�/.test(JSON.stringify(after)) ? 'PERINGATAN: ada karakter aneh' : 'tidak ada karakter aneh (Ã / Â)');
