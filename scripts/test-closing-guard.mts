/**
 * Uji pagar data closing (wa-agent/closing-guard.ts + pemakaiannya di closing.ts).
 * Jalankan: npx tsx scripts/test-closing-guard.mts
 * Kasus 1-3 meniru kegagalan nyata di uji 26 Nov 2026: DeepSeek memanggil catat_closing dengan kode pos
 * tebakan ("20124"/"20113") dan nama "-"/"Customer" padahal customer tidak pernah menulisnya.
 * Kasus fail-open mengunci bahwa closing tidak pernah ditolak kalau teks customer tidak tersedia.
 */
import assert from 'node:assert/strict';
import {
  customerTextFrom,
  findUngroundedClosingData,
  ungroundedMessage,
} from '../supabase/functions/wa-agent/closing-guard.ts';

const ALAMAT = 'Nama: Budi Santoso\nAlamat: Jl. Sei Batang Hari No. 12 RT 02 RW 03, Kel. Helvetia Tengah, Kec. Medan Helvetia, Kota Medan';
const ALAMAT_POS = `${ALAMAT} 20124`;

const cases: Array<[string, () => void | Promise<void>]> = [];
const test = (name: string, fn: () => void | Promise<void>) => cases.push([name, fn]);

// ── kegagalan nyata ──
test('1. kode pos tebakan yang tidak ada di chat DITOLAK (skenario 6)', () => {
  const p = findUngroundedClosingData({ nama: 'Budi Santoso', kode_pos: '20124' }, ALAMAT);
  assert.equal(p.length, 1);
  assert.match(p[0], /kode pos 20124 tidak ada/);
});
test('2. nama "-" DITOLAK walau kode pos benar (skenario 24)', () => {
  const p = findUngroundedClosingData({ nama: '-', kode_pos: '20124' }, 'Alamat: Jl. Sei Batang Hari No. 12, Kec. Medan Helvetia, Kota Medan 20124');
  assert.equal(p.length, 1);
  assert.match(p[0], /nama penerima belum ada/);
});
test('3. nama "Customer" / "Pelanggan" / "Kak" dianggap kata pengganti', () => {
  for (const nama of ['Customer', 'pelanggan', 'Kak', 'Penerima', 'Tidak ada']) {
    const p = findUngroundedClosingData({ nama, kode_pos: '20124' }, ALAMAT_POS);
    assert.equal(p.length, 1, `harus ditolak: ${nama}`);
  }
});

// ── data sah harus lolos ──
test('4. nama dan kode pos tertulis oleh customer LOLOS', () => {
  assert.deepEqual(findUngroundedClosingData({ nama: 'Budi Santoso', kode_pos: '20124' }, ALAMAT_POS), []);
});
test('5. nama beda huruf besar/aksen/gelar tetap lolos selama satu kata namanya ada', () => {
  assert.deepEqual(findUngroundedClosingData({ nama: 'BUDI SANTOSO', kode_pos: '20124' }, ALAMAT_POS), []);
  assert.deepEqual(findUngroundedClosingData({ nama: 'Pak Budi', kode_pos: '20124' }, ALAMAT_POS), []);
  assert.deepEqual(findUngroundedClosingData({ nama: 'Siti Aisyah', kode_pos: '16431' }, 'penerima Siti Aisyah, Pancoran Mas, Depok kodepos 16431'), []);
});
test('6. kode pos dikirim customer di pesan terpisah ("20124") LOLOS', () => {
  assert.deepEqual(findUngroundedClosingData({ nama: 'Budi Santoso', kode_pos: '20124' }, `${ALAMAT}\n20124`), []);
});

// ── penolakan tepat ──
test('7. nama yang tidak ada di chat DITOLAK', () => {
  const p = findUngroundedClosingData({ nama: 'Rina Wijaya', kode_pos: '20124' }, ALAMAT_POS);
  assert.equal(p.length, 1);
  assert.match(p[0], /nama "Rina Wijaya" tidak ada/);
});
test('8. 5 angka yang hanya potongan nomor HP/nominal TIDAK dianggap kode pos', () => {
  assert.equal(findUngroundedClosingData({ nama: 'Budi', kode_pos: '81200' }, 'Budi 081200000001 transfer').length, 1);
  assert.equal(findUngroundedClosingData({ nama: 'Budi', kode_pos: '20124' }, 'Budi transfer Rp1201245').length, 1);
});
test('9. kode pos bukan 5 angka ("-", kosong, "2012") DITOLAK', () => {
  for (const kode_pos of ['-', '', '2012', '201245', 'abcde', undefined as unknown as string]) {
    const p = findUngroundedClosingData({ nama: 'Budi Santoso', kode_pos }, ALAMAT_POS);
    assert.equal(p.length, 1, `harus ditolak: ${String(kode_pos)}`);
    assert.match(p[0], /kode pos belum ada/);
  }
});
test('10. dua masalah sekaligus dilaporkan keduanya', () => {
  const p = findUngroundedClosingData({ nama: '-', kode_pos: '99999' }, ALAMAT);
  assert.equal(p.length, 2);
  const msg = ungroundedMessage(p);
  assert.match(msg, /kode pos 99999/);
  assert.match(msg, /nama penerima/);
  assert.match(msg, /Jangan menebak/);
});

// ── fail-open ──
test('11. teks customer kosong/tidak ada => TIDAK ada yang ditolak (fail-open)', () => {
  assert.deepEqual(findUngroundedClosingData({ nama: '-', kode_pos: '-' }, ''), []);
  assert.deepEqual(findUngroundedClosingData({ nama: '-', kode_pos: '-' }, '   \n  '), []);
  assert.deepEqual(findUngroundedClosingData({ nama: '-', kode_pos: '-' }, undefined as unknown as string), []);
});
test('12. nama pendek tanpa kata >=3 huruf ("Al") tidak ditolak oleh pencocokan kata (fail-open)', () => {
  assert.deepEqual(findUngroundedClosingData({ nama: 'Al', kode_pos: '20124' }, ALAMAT_POS), []);
});

// ── pengumpul teks customer ──
test('13. customerTextFrom hanya memuat tulisan customer, bukan balasan kami', () => {
  const text = customerTextFrom([
    {
      message: 'ini ka',
      riwayat: [
        { message: 'Nama: Budi Santoso', reply_text: 'Kode posnya 20124 ya Ka' } as any,
        { message: '', reply_text: 'Terima kasih' } as any,
      ],
    },
  ]);
  assert.match(text, /Budi Santoso/);
  assert.match(text, /ini ka/);
  assert.doesNotMatch(text, /20124/);
  assert.doesNotMatch(text, /Terima kasih/);
});
test('14. kode pos yang hanya ada di balasan kami tidak bisa "membenarkan" tebakan', () => {
  const text = customerTextFrom([{ message: '', riwayat: [{ message: ALAMAT, reply_text: 'Kode pos 20124 ya Ka' } as any] }]);
  assert.equal(findUngroundedClosingData({ nama: 'Budi Santoso', kode_pos: '20124' }, text).length, 1);
});
test('15. customerTextFrom aman untuk masukan kosong/aneh', () => {
  assert.equal(customerTextFrom([]), '');
  assert.equal(customerTextFrom(undefined as any), '');
  assert.equal(customerTextFrom([{ message: undefined, riwayat: undefined } as any]), '');
});

// ── pemakaian di runClosing (tanpa jaringan: gagal/lolos terlihat dari pesan galatnya) ──
// closing.ts mengimpor cover-stock.ts yang membaca Deno.env saat dimuat; sediakan stub.
(globalThis as any).Deno ??= { env: { get: () => undefined } };
const { runClosing } = await import('../supabase/functions/wa-agent/closing.ts');
const deps = { opsFetch: async () => ({}), adminWa: '6289601062990', decideBonus: async () => ({ cover: null, reason: '' }), rupiah: (v: unknown) => `Rp${v}` };
const baseArgs = {
  nomor: '6281200000001', nominal: 408000, inbox_id: 'p-701', nama: 'Budi Santoso', alamat: 'Jl. Sei Batang Hari No. 12',
  kecamatan: 'Medan Helvetia', kota: 'Kota Medan', provinsi: 'Sumatera Utara', kode_pos: '20124', pesanan: 'Thobe M x1 - Rp359.000',
  items: [{ product_id: 'thobe-broken-white-jiharkah', color: 'default', size: 'M', quantity: 1 }],
};
test('16. runClosing menolak kode pos tebakan SEBELUM menyentuh database', async () => {
  const res = await runClosing(baseArgs, { dry: false, customerText: ALAMAT, service: {} }, deps as any);
  assert.equal(res.isError, true);
  assert.match(res.text, /kode pos 20124 tidak ada/);
});
test('17. runClosing dengan data sah melewati pagar (berhenti di langkah berikutnya karena tanpa service)', async () => {
  const res = await runClosing(baseArgs, { dry: false, customerText: ALAMAT_POS }, deps as any);
  assert.equal(res.isError, true);
  assert.match(res.text, /Database Academy tidak tersedia/);
});
test('18. runClosing tanpa customerText (fail-open) tetap melewati pagar', async () => {
  const res = await runClosing({ ...baseArgs, kode_pos: '99999' }, { dry: false }, deps as any);
  assert.match(res.text, /Database Academy tidak tersedia/);
});
test('19. mode dry tidak berubah (tetap hanya melapor DRY)', async () => {
  const res = await runClosing(baseArgs, { dry: true, customerText: ALAMAT }, deps as any);
  assert.match(res.text, /^DRY:/);
});

let passed = 0;
for (const [name, fn] of cases) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}\n      ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${cases.length} lulus`);
