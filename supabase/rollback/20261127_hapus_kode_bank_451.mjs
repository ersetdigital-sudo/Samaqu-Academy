/**
 * Hapus "(451)" (kode bank BSI) di belakang nama rekening pada persona dan memori bot (27 Nov 2026).
 * Customer mengira angka itu kode unik transfer.
 *
 * PENGGANTIAN SEMPIT: hanya teks "Abdullah (451)" menjadi "Abdullah"; sisa teks tidak disentuh. Jumlah kemunculan
 * harus PERSIS sama dengan yang ditemukan saat dry-run pertama (persona 1, memori 3 di 2 baris), kalau tidak skrip berhenti.
 *
 *   node supabase/rollback/20261127_hapus_kode_bank_451.mjs dry        # tampilkan baris sebelum/sesudah, TIDAK menulis
 *   node supabase/rollback/20261127_hapus_kode_bank_451.mjs apply      # simpan cadangan (BACKUP_FILE) lalu tulis
 *   node supabase/rollback/20261127_hapus_kode_bank_451.mjs rollback   # pulihkan dari BACKUP_FILE
 *
 * Kredensial dari env ACADEMY_SUPABASE_URL + ACADEMY_SERVICE_ROLE_KEY (atau file env di ENV_FILE=...).
 * BACKUP_FILE berisi persona/memori lengkap: simpan di LUAR repo (repo publik). JANGAN menjalankan sync-wa-knowledge.mjs.
 */
import fs from 'node:fs';
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

const LAMA = 'Abdullah (451)';
const BARU = 'Abdullah';
const EXPECT_PERSONA = 1;
const EXPECT_MEMORI = 3;
const md5 = (t) => crypto.createHash('md5').update(t).digest('hex');
const count = (t, n) => t.split(n).length - 1;
const get = async (p) => (await fetch(`${base}/rest/v1/${p}`, { headers })).json();
const patch = async (p, body) => {
  const r = await fetch(`${base}/rest/v1/${p}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
  const out = await r.json();
  if (!r.ok) throw new Error(`PATCH ${p}: HTTP ${r.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
};

const settings = (await get('ai_settings?select=behavior&id=eq.1'))[0];
const persona = settings?.behavior?.systemInstructions;
if (typeof persona !== 'string') throw new Error('persona tidak terbaca');
const memoriAll = await get('memory_items?select=id,title,status,content');

if (mode === 'rollback') {
  if (!backupFile || !fs.existsSync(backupFile)) throw new Error('BACKUP_FILE wajib untuk rollback');
  const b = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  // Persona hanya dipulihkan kalau isinya masih hasil apply kita (tidak menimpa perubahan orang lain).
  if (md5(persona) !== b.persona.md5Sesudah) {
    console.log('BERHENTI: persona sudah berubah sejak apply (md5 beda). Persona TIDAK dipulihkan; pulihkan manual.');
    process.exit(2);
  }
  await patch('ai_settings?id=eq.1', { behavior: { ...settings.behavior, systemInstructions: b.persona.systemInstructions } });
  for (const m of b.memori) await patch(`memory_items?id=eq.${m.id}`, { content: m.content });
  console.log(`rollback selesai: persona + ${b.memori.length} memori dipulihkan`);
  process.exit(0);
}

const nPersona = count(persona, LAMA);
const memoriKena = memoriAll.filter((m) => String(m.content || '').includes(LAMA));
const nMemori = memoriKena.reduce((sum, m) => sum + count(m.content, LAMA), 0);
console.log(`persona: ${nPersona} kemunculan (harus ${EXPECT_PERSONA}); memori: ${nMemori} kemunculan di ${memoriKena.length} baris (harus ${EXPECT_MEMORI})`);
if (nPersona !== EXPECT_PERSONA || nMemori !== EXPECT_MEMORI) {
  console.log('BERHENTI: jumlah tidak sama dengan yang diperkirakan. Tidak ada yang ditulis.');
  process.exit(2);
}

const baris = (t) => t.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => l.includes(LAMA));
const personaBaru = persona.split(LAMA).join(BARU);
console.log('\n--- PERSONA ---');
for (const [i, l] of baris(persona)) console.log(`L${i} -  ${l}\nL${i} +  ${l.split(LAMA).join(BARU)}`);
for (const m of memoriKena) {
  console.log(`\n--- MEMORI [${m.title}] (${m.id}, ${m.status}) ---`);
  for (const [i, l] of baris(m.content)) console.log(`L${i} -  ${l.slice(0, 200)}\nL${i} +  ${l.split(LAMA).join(BARU).slice(0, 200)}`);
}
if (/[^\x00-\x7F]/.test(BARU)) throw new Error('teks pengganti memuat karakter non-ASCII');

if (mode === 'dry') {
  console.log('\nDRY-RUN: tidak ada yang ditulis.');
  process.exit(0);
}

if (!backupFile) throw new Error('BACKUP_FILE wajib untuk apply (simpan di luar repo)');
fs.writeFileSync(
  backupFile,
  JSON.stringify(
    {
      persona: { md5Sebelum: md5(persona), md5Sesudah: md5(personaBaru), systemInstructions: persona },
      memori: memoriKena.map((m) => ({ id: m.id, title: m.title, content: m.content })),
    },
    null,
    2,
  ),
);
console.log(`\ncadangan: ${backupFile}`);

await patch('ai_settings?id=eq.1', { behavior: { ...settings.behavior, systemInstructions: personaBaru } });
for (const m of memoriKena) await patch(`memory_items?id=eq.${m.id}`, { content: m.content.split(LAMA).join(BARU) });

// verifikasi dari DB
const p2 = (await get('ai_settings?select=behavior&id=eq.1'))[0].behavior.systemInstructions;
const m2 = await get('memory_items?select=id,content&status=eq.published');
console.log(`terverifikasi: persona sisa "(451)" ${count(p2, '(451)')}, md5 ${md5(p2)} ${md5(p2) === md5(personaBaru) ? '(sama dengan yang ditulis)' : '(BEDA!)'}`);
console.log(`terverifikasi: memori published sisa "(451)" ${m2.reduce((s, m) => s + count(String(m.content || ''), '(451)'), 0)}`);
console.log(/Ã|Â|�/.test(p2) ? 'PERINGATAN: ada karakter aneh' : 'tidak ada karakter aneh (Ã / Â)');
