/**
 * Uji pengaman pasangan foto + keterangan (wa-agent/media-pairing.ts).
 * Jalankan: npx tsx scripts/test-media-pairing.mts
 * Kasus 1-3 adalah panggilan kirim_wa NYATA yang salah (run 15291, 22 Nov 2026); kasus 4-6 adalah run 15296
 * yang benar. Semua kasus lain mengunci perilaku fail-open (tidak boleh menolak pesan yang sah).
 */
import assert from 'node:assert/strict';
import { checkPhotoPairing, productMentions, labelFromSlug } from '../supabase/functions/wa-agent/media-pairing.ts';

const BASE = 'https://samaqu-media.samaqu.workers.dev/katalog/kandora';
const BW = `${BASE}/kandora-broken-white/03_broken-white_foto.png`;
const NAVY = `${BASE}/kandora-navy/01_navy_foto.png`;
const COFFEE = `${BASE}/kandora-coffe-brown/00_coffee-brown_foto.jpg`;

let passed = 0;
const cases: Array<[string, () => void]> = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const ok = (url: string, caption: string) => assert.equal(checkPhotoPairing(url, caption).ok, true, `harus lolos: ${caption}`);
const blocked = (url: string, caption: string) => {
  const res = checkPhotoPairing(url, caption);
  assert.equal(res.ok, false, `harus ditolak: ${caption}`);
  return res.ok ? '' : res.message;
};

// ── kejadian nyata yang salah (run 15291) ──
test('1. foto BW + keterangan umum lolos', () => ok(BW, 'Ini contoh warnanya ya Ka, warna-warna Kandora yang ready.'));
test('2. foto Navy + keterangan "Kandora Broken White" DITOLAK', () => {
  const msg = blocked(NAVY, 'Kandora Broken White, tanpa kerah dengan tali tarbush yang bisa dilepas-pasang.');
  assert.match(msg, /Kandora Navy/);
  assert.match(msg, /Broken White/);
});
test('3. foto Coffee Brown + keterangan "Kandora Navy" DITOLAK', () => {
  const msg = blocked(COFFEE, 'Kandora Navy, kain B-01 yang adem dan tidak menerawang.');
  assert.match(msg, /Kandora Coffe Brown/);
});

// ── run yang benar (15296) harus lolos semua ──
test('4. BW benar lolos', () => ok(BW, 'Kandora Broken White, kain B-01 adem dan tidak menerawang'));
test('5. Navy benar lolos', () => ok(NAVY, 'Kandora Navy, kain B-01 warna gelap yang rapi'));
test('6. Coffee Brown benar lolos (slug salah ketik "coffe")', () => ok(COFFEE, 'Kandora Coffee Brown, kain B-02 premium yang lebih tebal dan tegas'));

// ── fail-open: tidak boleh menolak yang sah ──
test('7. tanpa URL lolos', () => ok('', 'Kandora Navy, kain B-01'));
test('8. URL bukan foto katalog lolos (foto series/bahan/bukti)', () => {
  ok('https://rbjxjdgqtcwwbvuwtlpg.supabase.co/storage/v1/object/public/series-videos/abc.mp4', 'Kandora Navy ya Ka');
  ok('https://samaqu-media.samaqu.workers.dev/series/imron.png', 'Thobe Nahawand series Imron');
});
test('9. keterangan tanpa nama produk lolos', () => {
  ok(NAVY, 'Ini fotonya ya Ka, bahannya adem dan rapi.');
  ok(NAVY, 'Kandora ini tanpa kerah, lengannya pakai resleting.');
});
test('10. sapaan huruf besar setelah kata kategori bukan nama produk', () => {
  ok(NAVY, 'Kandora Ka, ini fotonya ya.');
  ok(NAVY, 'Thobe Kami ready semua ukuran.');
});
test('11. keterangan menyebut produk yang benar plus lainnya lolos', () => ok(NAVY, 'Kandora Navy atau Kandora Mint, dua-duanya ready ya Ka'));
test('12. huruf kecil semua tidak dianggap nama (fail-open)', () => ok(NAVY, 'kandora broken white'));
test('13. toleransi salah ketik slug (coffe vs coffee)', () => ok(COFFEE, 'Kandora Coffee Brown'));
test('14. warna lain di keterangan DITOLAK walau satu kata', () => {
  blocked(NAVY, 'Kandora Mint, tanpa kerah');
  blocked(BW, 'Kandora Superblack ready');
});
test('15. thobe: nama berurutan beda tetap cocok', () => {
  const url = 'https://samaqu-media.samaqu.workers.dev/katalog/thobe/thobe-broken-white-imalah/01_foto.png';
  ok(url, 'Thobe Imalah Broken White, kain B-01');
  ok(url, 'Thobe Broken White Imalah');
  blocked(url, 'Thobe Navy Nahawand');
});
test('16. input aneh tidak melempar error', () => {
  ok(undefined as unknown as string, undefined as unknown as string);
  // slug dengan encoding rusak: decodeURIComponent melempar, pengaman harus diam-diam meloloskan
  ok('https://x.test/katalog/kandora/%E0%A4%A/foto.png', 'Kandora Navy');
});
test('17. productMentions dan labelFromSlug', () => {
  assert.deepEqual(productMentions('Kandora Broken White, tanpa kerah'), [['Broken', 'White']]);
  assert.deepEqual(productMentions('Kandora Navy kain B-01'), [['Navy']]);
  assert.deepEqual(productMentions('warna-warna Kandora yang ready'), []);
  assert.equal(labelFromSlug('kandora-navy'), 'Kandora Navy');
});

for (const [name, fn] of cases) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`GAGAL ${name}\n      ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${cases.length} kasus lulus`);
