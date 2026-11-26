/**
 * Uji sisi bot untuk Promo Ongkir (26 Nov 2026).
 * Jalankan: npx tsx scripts/test-promo-ongkir-bot.mts
 *
 * Bukti utama "saklar OFF = persis seperti sebelum fitur": rekap, teks cek_ongkir, dan blok bonus versi BARU
 * dibandingkan dengan versi LAMA yang diambil dari git (`HEAD`) untuk banyak masukan tanpa field promo.
 * Lalu kasus saklar ON (tabel brief), blok STATUS PROMO, dan bonus cover bot ON/OFF.
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// cover-stock.ts membaca Deno.env saat dimuat.
(globalThis as any).Deno = { env: { get: () => '' } };

const cases: Array<[string, () => Promise<void> | void]> = [];
const test = (name: string, fn: () => Promise<void> | void) => cases.push([name, fn]);

const git = (path: string) => execSync(`git show HEAD:${path}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const tmp = mkdtempSync(join(tmpdir(), 'promo-ongkir-old-'));
const lama = (path: string, nama: string) => {
  const file = join(tmp, nama);
  writeFileSync(file, git(path));
  return pathToFileURL(file).href;
};

const baru = await import('../supabase/functions/wa-agent/rekap-format.ts');
const lamaRekap = await import(lama('supabase/functions/wa-agent/rekap-format.ts', 'rekap-format.ts'));
const baruCore = await import('../supabase/functions/_shared/wa/tools-core.mjs');
const lamaCore = await import(lama('supabase/functions/_shared/wa/tools-core.mjs', 'tools-core.mjs'));
const promo = await import('../supabase/functions/wa-agent/promo-status.ts');
const cover = await import('../supabase/functions/wa-agent/cover-stock.ts');
const lamaCover = await import(lama('supabase/functions/wa-agent/cover-stock.ts', 'cover-stock.ts'));

const lines = [
  { label: 'Thobe Broken White Nahawand (kain B-01) M', quantity: 1, amount: 359000 },
  { label: 'Koko Sand Beige L', quantity: 2, amount: 540000 },
];
const servicesAsli = [
  { name: 'EZ', cost: 11000, etd: '2-4 hari' },
  { name: 'ECO', cost: 8000, etd: '3-7 hari' },
];

test('OFF: buildRekap baru = lama (layanan belum dipilih, EZ, ECO, bonus, potong panjang)', () => {
  const kasus = [
    { lines, services: servicesAsli },
    { lines, services: servicesAsli, chosenService: 'ez', shipTo: 'Ani, Jl. Mawar 1 Depok' },
    { lines, services: servicesAsli, chosenService: 'ECO', bonus: 'Cover Thobe + Hanger', shipTo: 'Budi, Jl. Melati 2' },
    { lines, services: [servicesAsli[0]], potongPanjang: { label: '5 cm', amount: 35000 } },
  ];
  for (const k of kasus) assert.deepEqual(baru.buildRekap(k as any), lamaRekap.buildRekap(k as any));
});

test('OFF: buildOngkirText baru = lama', () => {
  const rows = [
    { service: 'J&T EZ (Reguler)', cost: 11000, etd: '2-4 hari' },
    { serviceCode: 'ECO', cost: 8000 },
  ];
  const k = { rows, kota: 'Kota Bandung', kecamatan: 'Coblong', berat_gram: 1000, configured: undefined };
  assert.equal(baruCore.buildOngkirText(k), lamaCore.buildOngkirText(k));
  assert.equal(baruCore.buildOngkirText({ ...k, rows: [] }), lamaCore.buildOngkirText({ ...k, rows: [] }));
  assert.equal(baruCore.buildOngkirText({ ...k, configured: false }), lamaCore.buildOngkirText({ ...k, configured: false }));
});

test('ON: teks cek_ongkir menyebut tarif asli, dibayar, dan hemat (Bandung 11.000 -> 6.600)', () => {
  const rows = [{ service: 'J&T EZ (Reguler)', cost: 11000, payCost: 6600, discount: 4400, promoLabel: 'Hemat ongkir 40%', etd: '2-4 hari' }];
  const teks = baruCore.buildOngkirText({ rows, kota: 'Kota Bandung', kecamatan: 'Coblong', berat_gram: 1000 });
  assert.match(teks, /tarif J&T Rp11\.000/);
  assert.match(teks, /customer bayar Rp6\.600/);
  assert.match(teks, /hemat Rp4\.400/);
  const gratis = baruCore.buildOngkirText({
    rows: [{ service: 'J&T EZ (Reguler)', cost: 9000, payCost: 0, discount: 9000, promoLabel: 'Free ongkir' }],
    kota: 'Jakarta Selatan', kecamatan: 'Pancoran', berat_gram: 1000,
  });
  assert.match(gratis, /customer bayar Rp0 \(gratis ongkir\)/);
});

test('ON: rekap memakai ongkir setelah promo, tarif asli dicoret, total benar', () => {
  const layanan = [{ name: 'EZ', cost: 11000, etd: '2-4 hari', payCost: 6600, discount: 4400, promoLabel: 'Hemat ongkir 40%' }];
  const r = baru.buildRekap({ lines, services: layanan, chosenService: 'EZ', shipTo: 'Ani, Bandung' });
  assert.match(r.customerText, /~Rp11\.000~ Rp6\.600 \(Hemat ongkir 40%\)/);
  assert.match(r.customerText, /Total Rp905\.600/); // 359.000 + 540.000 + 6.600
  const gratis = baru.buildRekap({ lines, services: [{ name: 'EZ', cost: 9000, payCost: 0, discount: 9000, promoLabel: 'Free ongkir' }], chosenService: 'EZ' });
  assert.match(gratis.customerText, /GRATIS \(Free ongkir\)/);
  assert.match(gratis.customerText, /Total Rp899\.000/);
  const dua = [...layanan, { name: 'ECO', cost: 8000, payCost: 4800, discount: 3200, promoLabel: 'Hemat ongkir 40%' }];
  const pilih = baru.buildRekap({ lines, services: dua });
  assert.equal(pilih.final, false);
  assert.match(pilih.customerText, /J&T EZ Rp6\.600 \(Hemat ongkir 40%, hemat Rp4\.400\) \(2-4 hari\), total Rp905\.600/);
  assert.match(pilih.customerText, /J&T ECO Rp4\.800 .*total Rp903\.800/);
});

test('STATUS PROMO: hanya yang aktif; tidak terbaca = perilaku lama', () => {
  const tak = promo.promoStatusContext(null);
  assert.match(tak, /TIDAK ADA yang berlaku/);
  assert.match(tak, /Free Cover Hanger .*BERLAKU/);
  const semua = promo.promoStatusContext({ today: '2026-11-26', ongkirJabodetabek: true, ongkirLuar: true, ongkirLuarPersen: 40, fchBot: false });
  assert.match(semua, /Free ongkir Jabodetabek: BERLAKU/);
  assert.match(semua, /dipotong 40%/);
  assert.match(semua, /Free Cover Hanger .*TIDAK BERLAKU/);
  assert.doesNotMatch(semua, /TIDAK ADA yang berlaku/);
});

test('bonus cover bot: ON = blok lama persis (parameter bawaan), OFF = bonus dilarang', async () => {
  // Tanpa argumen / true: kode lama dan baru harus memberi teks yang sama untuk kasus stok tidak terbaca.
  const [a, b, c] = await Promise.all([cover.bonusStockContext(), cover.bonusStockContext(true), lamaCover.bonusStockContext()]);
  assert.equal(a, c);
  assert.equal(b, c);
  const mati = await cover.bonusStockContext(false);
  assert.match(mati, /TIDAK berlaku/);
  assert.match(mati, /Jangan menawarkan/);
});

test('readPromoStatus: gagal = null (perilaku lama), field kosong = bonus tetap nyala', async () => {
  assert.equal(await promo.readPromoStatus(async () => { throw new Error('x'); }), null);
  const s = await promo.readPromoStatus(async () => ({ today: '2026-11-26', ongkirJabodetabek: false, ongkirLuar: false }));
  assert.equal(s?.fchBot, true);
  assert.equal(s?.ongkirLuar, false);
});

let gagal = 0;
for (const [name, fn] of cases) {
  try {
    await fn();
    console.log('OK   ', name);
  } catch (error) {
    gagal++;
    console.log('GAGAL', name, '\n      ', (error as Error).message);
  }
}
console.log(`\n${cases.length - gagal}/${cases.length} lulus`);
process.exit(gagal ? 1 : 0);
