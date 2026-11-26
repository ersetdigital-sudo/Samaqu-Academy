/**
 * Uji aturan bukti-duluan (wa-agent/bukti-duluan.ts) dan pemasangannya di index.ts.
 * Jalankan: npx tsx scripts/test-bukti-duluan.mts
 * Efek pada perilaku model diukur terpisah (uji model, 26 Nov 2026); tes ini mengunci isi aturan, ASCII murni,
 * dan bahwa aturan benar-benar disisipkan di prompt sebelum WA_AGENT_RULES.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ATURAN_BUKTI_DULUAN } from '../supabase/functions/wa-agent/bukti-duluan.ts';

const cases: Array<[string, () => void]> = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

test('1. teks ASCII murni (aturan persona: tanpa karakter non-ASCII)', () => {
  assert.equal(/[^\x00-\x7F]/.test(ATURAN_BUKTI_DULUAN), false);
});
test('2. memuat inti aturan: bukti duluan, jangan kirim rekening, catat_closing dengan inbox_id lampiran', () => {
  for (const frasa of ['BUKTI TRANSFER', 'JANGAN kirim nomor rekening', 'JANGAN minta bukti lagi', 'catat_closing', 'inbox_id lampiran', 'nominal sesuai total pada rekap']) {
    assert.ok(ATURAN_BUKTI_DULUAN.includes(frasa), `harus memuat: ${frasa}`);
  }
});
test('3. membedakan foto produk dari bukti dan memberi jalan keluar saat ragu', () => {
  assert.ok(ATURAN_BUKTI_DULUAN.includes('foto produk'));
  assert.ok(ATURAN_BUKTI_DULUAN.includes('bukti transfernya ya?'));
});
test('4. tidak memuat backtick atau ${ (aman sebagai string biasa)', () => {
  assert.equal(/[`]|\$\{/.test(ATURAN_BUKTI_DULUAN), false);
});
test('5. aturan disisipkan di index.ts tepat sebelum WA_AGENT_RULES dan setelah ATURAN KONTEKS', () => {
  const index = fs.readFileSync('supabase/functions/wa-agent/index.ts', 'utf8');
  const iKonteks = index.indexOf("'ATURAN KONTEKS & CLOSING LANJUTAN");
  const iAturan = index.indexOf('ATURAN_BUKTI_DULUAN,');
  const iRules = index.indexOf('WA_AGENT_RULES,');
  assert.ok(iKonteks > 0 && iAturan > iKonteks, 'aturan harus sesudah ATURAN KONTEKS');
  assert.ok(iRules > iAturan, 'aturan harus sebelum WA_AGENT_RULES');
  assert.ok(index.includes("import { ATURAN_BUKTI_DULUAN } from './bukti-duluan.ts';"));
});

let passed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}\n      ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${cases.length} lulus`);
