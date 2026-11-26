/**
 * Uji perapi pesan "CS WA - perlu admin" (wa-agent/admin-handoff-format.ts) dan pemasangannya di tools.ts.
 * Jalankan: npx tsx scripts/test-admin-handoff-format.mts
 * Contoh pesan di bawah adalah pesan NYATA yang dikirim bot ke admin pada 26 Nov 2026 (nomor tidak dimuat):
 * satu paragraf panjang dengan label menyambung (Luthfi, komplain pesanan lunas) dan satu tanpa label (Najmi).
 * Kasus penting: isi tidak boleh hilang satu kata pun, dan alamat bersingkatan ("Jl. Garu No. 4") tidak boleh terpotong.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formatAdminHandoff } from '../supabase/functions/wa-agent/admin-handoff-format.ts';

const LUTHFI =
  'Status: customer sudah setuju rekap Thobe Broken White Imron size S (Rp374.000 + ongkir EZ Rp11.000 = Rp385.000), lalu minta ganti warna ke Superblack Imron size S. ' +
  'Ringkasan: customer mau pesan sekarang tapi minta dikirim minggu atau senin karena keluar kota, pulang hari Selasa. Menanyakan apakah minggu ada pengiriman. ' +
  'Keputusan customer: warna Superblack Imron, size S. ' +
  'Tindakan admin: konfirmasi apakah pengiriman bisa dijadwalkan minggu/senin, lalu kirim rekening dan proses pesanan. ' +
  'Catatan: alamat Luthfi Prayoga, Jl Garu 1 no 4 Y (Kedai Hommy), Babakan Sari, Kiaracondong, Bandung, RT08/11.';
const KOMPLAIN =
  'Status: Pesanan OPS-20261100-598 (salah ketik, benar OPS-20261110-598) lunas 10 Nov 2026, 12 pcs Thobe Deep Maroon Jiharkah, belum ada resi sampai 26 Nov. ' +
  'Ringkasan: Customer tanya progress, pesanan sudah lunas tapi lama tidak ada kabar dan belum dikirim. ' +
  'Keputusan customer: Menunggu pengiriman dan minta dikabari begitu ada resi. ' +
  'Tindakan admin: Cek kenapa pesanan belum dikirim dan kapan akan diproses. ' +
  'Catatan: Customer sudah beberapa kali menanyakan progress.';
const NAJMI =
  'Customer menanyakan status pengiriman pesanan Vest Duha Series Dark Taupe size S (total Rp292.000, J&T EZ, tujuan Kp Depok Cisomang RT 14 RW 05, Darangdan, Kab Purwakarta). ' +
  'Bukti transfer sudah dikirim dan rekap disetujui, tapi data pesanan belum muncul di sistem. Mohon dicek status pesanan dan nomor resinya.';

const kata = (s: string) => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).sort();
const tanpaJudul = (s: string) => s.split('\n').filter((l) => !/^\*[^*]+\*$/.test(l)).join(' ');
const tanpaLabel = (s: string) => s.replace(/(?<![A-Za-z])(status|ringkasan|keputusan customer|tindakan admin|catatan)\s*:\s*/gi, ' ');

const cases: Array<[string, () => void]> = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

test('1. pesan Luthfi: lima judul tebal berurutan, tiap judul diikuti butir', () => {
  const out = formatAdminHandoff(LUTHFI);
  const judul = out.split('\n').filter((l) => /^\*[^*]+\*$/.test(l));
  assert.deepEqual(judul, ['*Status*', '*Ringkasan*', '*Keputusan customer*', '*Tindakan admin*', '*Catatan*']);
  assert.ok(out.includes('*Status*\n- Customer sudah setuju rekap Thobe Broken White Imron size S (Rp374.000 + ongkir EZ Rp11.000 = Rp385.000), lalu minta ganti warna ke Superblack Imron size S.'));
  assert.ok(out.includes('*Ringkasan*\n- Customer mau pesan sekarang tapi minta dikirim minggu atau senin karena keluar kota, pulang hari Selasa.\n- Menanyakan apakah minggu ada pengiriman.'));
  assert.ok(out.includes('*Tindakan admin*\n- Konfirmasi apakah pengiriman bisa dijadwalkan minggu/senin, lalu kirim rekening dan proses pesanan.'));
  assert.ok(!out.includes('\n\n\n'), 'tidak boleh ada tiga baris kosong');
});
test('2. antar bagian dipisah satu baris kosong; tidak ada label bertitik dua tersisa', () => {
  const out = formatAdminHandoff(LUTHFI);
  assert.equal(out.split('\n\n').length, 5);
  assert.doesNotMatch(out, /(^|\s)(Status|Ringkasan|Keputusan customer|Tindakan admin|Catatan):/);
});
test('3. pesan komplain: nomor pesanan dan koreksi ejaan dalam kurung utuh', () => {
  const out = formatAdminHandoff(KOMPLAIN);
  assert.ok(out.includes('Pesanan OPS-20261100-598 (salah ketik, benar OPS-20261110-598) lunas 10 Nov 2026, 12 pcs Thobe Deep Maroon Jiharkah, belum ada resi sampai 26 Nov.'));
  assert.ok(out.includes('*Keputusan customer*\n- Menunggu pengiriman dan minta dikabari begitu ada resi.'));
});
test('4. tanpa label (pesan Najmi): kalimat biasa ke Ringkasan, "Mohon ..." ke Tindakan admin', () => {
  const out = formatAdminHandoff(NAJMI);
  assert.ok(out.startsWith('*Ringkasan*\n- Customer menanyakan status pengiriman pesanan Vest Duha Series Dark Taupe size S (total Rp292.000, J&T EZ, tujuan Kp Depok Cisomang RT 14 RW 05, Darangdan, Kab Purwakarta).\n- Bukti transfer sudah dikirim dan rekap disetujui, tapi data pesanan belum muncul di sistem.'));
  assert.ok(out.endsWith('*Tindakan admin*\n- Mohon dicek status pesanan dan nomor resinya.'));
});
test('5. TIDAK ADA KATA HILANG atau bertambah pada ketiga pesan nyata', () => {
  for (const [nama, teks] of [['Luthfi', LUTHFI], ['Komplain', KOMPLAIN], ['Najmi', NAJMI]] as const) {
    assert.deepEqual(kata(tanpaJudul(formatAdminHandoff(teks))), kata(tanpaLabel(teks)), `kata harus sama: ${nama}`);
  }
});
test('6. singkatan beralamat tidak memotong kalimat ("Jl. Garu No. 4, Kec. ..., Kab. Bandung.")', () => {
  const out = formatAdminHandoff('Catatan: Alamat: Jl. Garu No. 4, Kec. Kiaracondong, Kab. Bandung. Rumah warna biru dekat masjid.');
  assert.equal(out, '*Catatan*\n- Alamat: Jl. Garu No. 4, Kec. Kiaracondong, Kab. Bandung.\n- Rumah warna biru dekat masjid.');
});
test('7. label huruf besar/kecil campur dan berulang digabung ke bagian yang sama', () => {
  const out = formatAdminHandoff('STATUS: satu dulu. status: dua lagi. Tindakan Admin: cek ya.');
  assert.equal(out, '*Status*\n- Satu dulu.\n- Dua lagi.\n\n*Tindakan admin*\n- Cek ya.');
});
test('8. teks sebelum label pertama masuk Ringkasan', () => {
  const out = formatAdminHandoff('Halo admin. Status: customer menunggu. Catatan: sudah transfer.');
  assert.ok(out.includes('*Ringkasan*\n- Halo admin.'));
  assert.ok(out.includes('*Status*\n- Customer menunggu.'));
});
test('9. masukan yang sudah berbutir/berbaris dirapikan tanpa butir ganda', () => {
  const out = formatAdminHandoff('Status:\n- customer setuju\n- minta ganti\nTindakan admin:\n- konfirmasi');
  assert.equal(out, '*Status*\n- Customer setuju\n- Minta ganti\n\n*Tindakan admin*\n- Konfirmasi');
});
test('10. "Status pesanan: ..." di tengah kalimat BUKAN label', () => {
  const out = formatAdminHandoff('Customer tanya soal paket. Status pesanan: dikirim kemarin.');
  assert.ok(!out.includes('*Status*'));
  assert.ok(out.includes('- Status pesanan: dikirim kemarin.'));
});
test('11. kosong/spasi => string kosong (pemanggil memakai teks asli)', () => {
  assert.equal(formatAdminHandoff(''), '');
  assert.equal(formatAdminHandoff('   \n  '), '');
  assert.equal(formatAdminHandoff(undefined as unknown as string), '');
});
test('12. teruskan_admin di tools.ts memakai perapi dengan cadangan teks asli', () => {
  const tools = fs.readFileSync('supabase/functions/wa-agent/tools.ts', 'utf8');
  assert.ok(tools.includes("import { formatAdminHandoff } from './admin-handoff-format.ts';"));
  assert.ok(tools.includes('formatAdminHandoff(pesan) || pesan'));
  assert.ok(tools.includes("summary: pesan,"), 'Perlu Review tetap menerima teks asli');
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
