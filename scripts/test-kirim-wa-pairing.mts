/**
 * Uji integrasi: pengaman pasangan foto benar-benar terpasang di tool `kirim_wa` (mode dry, tanpa kirim apa pun).
 * Jalankan: npx tsx scripts/test-kirim-wa-pairing.mts
 * Memakai tiga panggilan salah yang nyata (run 15291) dan tiga panggilan benar (run 15296).
 */
import assert from 'node:assert/strict';

// tools.ts membaca Deno.env saat dimuat; di Node cukup disediakan penggantinya (semua kosong).
(globalThis as unknown as { Deno: unknown }).Deno = { env: { get: () => undefined } };


async function main() {
const { executeTool } = await import('../supabase/functions/wa-agent/tools.ts');

const BASE = 'https://samaqu-media.samaqu.workers.dev/katalog/kandora';
const NOMOR = '628111111111';
const BW = `${BASE}/kandora-broken-white/03_broken-white_foto.png`;
const NAVY = `${BASE}/kandora-navy/01_navy_foto.png`;
const COFFEE = `${BASE}/kandora-coffe-brown/00_coffee-brown_foto.jpg`;

const ctx = () => ({ dry: true, senders: new Map<string, string>(), handled: new Set<string>(), outbox: [] as any[] });
const send = (url: string | undefined, pesan: string, c = ctx()) =>
  executeTool('kirim_wa', JSON.stringify({ nomor: NOMOR, pesan, ...(url ? { url } : {}) }), c).then((res) => ({ res, c }));

let passed = 0;
const check = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`GAGAL ${name}\n      ${(error as Error).message}`);
    process.exitCode = 1;
  }
};

await check('salah #1 (run 15291): foto Navy + "Kandora Broken White" ditolak, tidak masuk outbox', async () => {
  const { res, c } = await send(NAVY, 'Kandora Broken White, tanpa kerah dengan tali tarbush yang bisa dilepas-pasang.');
  assert.equal(res.isError, true);
  assert.match(res.text, /TIDAK dikirim/);
  assert.equal(c.outbox.length, 0);
});
await check('salah #2 (run 15291): foto Coffee Brown + "Kandora Navy" ditolak', async () => {
  const { res, c } = await send(COFFEE, 'Kandora Navy, kain B-01 yang adem dan tidak menerawang.');
  assert.equal(res.isError, true);
  assert.equal(c.outbox.length, 0);
});
await check('foto BW + keterangan umum lolos (masuk outbox lengkap dengan url)', async () => {
  const { res, c } = await send(BW, 'Ini contoh warnanya ya Ka, warna-warna Kandora yang ready.');
  assert.notEqual(res.isError, true);
  assert.equal(c.outbox.length, 1);
  assert.equal(c.outbox[0].url, BW);
});
await check('benar #1-#3 (run 15296) lolos semua', async () => {
  const pairs: Array<[string, string]> = [
    [BW, 'Kandora Broken White, kain B-01 adem dan tidak menerawang'],
    [NAVY, 'Kandora Navy, kain B-01 warna gelap yang rapi'],
    [COFFEE, 'Kandora Coffee Brown, kain B-02 premium yang lebih tebal dan tegas'],
  ];
  const shared = ctx();
  for (const [url, pesan] of pairs) {
    const { res } = await send(url, pesan, shared);
    assert.notEqual(res.isError, true, `harus lolos: ${pesan}`);
  }
  assert.equal(shared.outbox.length, 3);
});
await check('pesan teks tanpa foto tidak tersentuh pengaman', async () => {
  const { res, c } = await send(undefined, 'Kandora Navy ready ya Ka, ukuran M tinggal 7.');
  assert.notEqual(res.isError, true);
  assert.equal(c.outbox.length, 1);
});
await check('keterangan kosong tetap ditolak seperti sebelumnya (perilaku lama tidak berubah)', async () => {
  const { res } = await send(NAVY, '   ');
  assert.equal(res.isError, true);
  assert.match(res.text, /wajib diisi/);
});

console.log(`\n${passed}/6 pemeriksaan lulus`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
