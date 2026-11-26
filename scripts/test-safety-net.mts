/**
 * Uji jaring pengaman closing (wa-agent/safety-net.ts), termasuk isyarat bayar untuk "bukti duluan".
 * Jalankan: npx tsx scripts/test-safety-net.mts
 * Kasus 1 meniru kejadian nyata 26 Nov 2026 (run 19592/19595, pelanggan Najmi): bukti DANA dikirim sebelum bot pernah
 * mengirim rekening, disusul "Kak udah ya"; jaring pengaman lama menghasilkan 0 kasus. Kasus lain mengunci perilaku
 * lama dan memastikan foto produk atau pertanyaan biasa tidak ikut terjaring.
 */
import assert from 'node:assert/strict';
import { findUnclosedProofs, isPaidCue, type InboxRow } from '../supabase/functions/wa-agent/safety-net.ts';

const MIN = 60_000;
const NOW = Date.parse('2026-11-26T10:58:00Z');
const at = (menitLalu: number) => new Date(NOW - menitLalu * MIN).toISOString();
const S = '6281992123990';
const REKAP = 'Siap Ka, ini rekap pesanannya: Vest Duha Series Dark Taupe S x1 - Rp279.000 Total Rp292.000. Sudah benar semua Ka?';
const REKENING = 'Alhamdulillah. Transfer ke BSI 7153280058 a.n. Ardo Babus Abdullah (451) ya Ka. Kirim bukti transfernya ke sini.';

let n = 0;
const row = (over: Partial<InboxRow> & { menitLalu: number }): InboxRow => {
  const { menitLalu, ...rest } = over;
  return { id: `r${++n}`, sender: S, message: '', reply_text: '', status: 'sent', created_at: at(menitLalu), ...rest };
};
const gambar = (menitLalu: number, balasan = REKAP, extra: Partial<InboxRow> = {}) =>
  row({ menitLalu, message: '[lampiran]', media_key: 'wa/x.jpg', reply_text: balasan, ...extra });
const cari = (inbox: InboxRow[], extra: Record<string, unknown> = {}) =>
  findUnclosedProofs({ now: NOW, inbox, closings: [], drafts: [], orders: [], escalations: [], ...extra } as any);

const cases: Array<[string, () => void]> = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

// ── isyarat bayar ──
test('1. KASUS NAJMI: bukti duluan + "Kak udah ya" dalam 10 menit => 1 kasus (dulu 0)', () => {
  const bukti = gambar(26);
  const inbox = [
    row({ menitLalu: 38, message: 'Vest Dhuha series kak', reply_text: 'Siap Ka, ready. Boleh kirim nama dan alamat?' }),
    bukti,
    row({ menitLalu: 25.9, message: 'Kak udah ya', status: 'skipped' }),
    row({ menitLalu: 25, message: 'Iya kak benar', reply_text: REKENING }),
  ];
  const hasil = cari(inbox);
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].inboxId, bukti.id);
  assert.match(hasil[0].basis, /isyarat sudah bayar/);
});
test('2. isPaidCue: yang dihitung', () => {
  for (const t of ['Kak udah ya', 'udah ya kak', 'sudah', 'Sudah ya min', 'sudah tf', 'udah transfer kak', 'sdh bayar', 'tf nya udah', 'ini buktinya', 'bukti tf', 'Bukti transfer']) {
    assert.equal(isPaidCue(t), true, `harus dihitung: ${t}`);
  }
});
test('3. isPaidCue: yang TIDAK dihitung (pertanyaan/ obrolan biasa)', () => {
  for (const t of ['sudah ada ukuran M nya?', 'Iya kak benar', 'sudah benar semua', 'udah ada stok kak?', 'bisa cod?', 'mau tf kemana', 'minta bukti?', '', '   ']) {
    assert.equal(isPaidCue(t), false, `tidak boleh dihitung: ${t}`);
  }
  assert.equal(isPaidCue(`udah ${'x'.repeat(90)}`), false, 'pesan sangat panjang tidak dihitung');
});
test('4. foto produk + pertanyaan biasa "sudah ada ukuran M nya?" => 0', () => {
  assert.equal(cari([gambar(40, 'Untuk TB 168 BB 50 paling pas size S Ka.'), row({ menitLalu: 38, message: 'sudah ada ukuran M nya?' })]).length, 0);
});
test('5. isyarat terlalu jauh dari gambar (> 10 menit) => 0', () => {
  assert.equal(cari([gambar(40, 'Terima kasih Ka'), row({ menitLalu: 20, message: 'udah ya' })]).length, 0);
});
test('6. isyarat tepat di dalam jendela (sebelum gambar) => 1', () => {
  assert.equal(cari([row({ menitLalu: 33, message: 'sudah tf kak' }), gambar(30, 'Terima kasih Ka')]).length, 1);
});
test('7. isyarat dari NOMOR LAIN tidak dihitung', () => {
  assert.equal(cari([gambar(40, 'Terima kasih Ka'), row({ menitLalu: 38, sender: '6281200000000', message: 'udah ya' })]).length, 0);
});
test('8. "ini buktinya" disusul gambar => 1', () => {
  assert.equal(cari([row({ menitLalu: 31, message: 'ini buktinya' }), gambar(30, 'Terima kasih Ka')]).length, 1);
});

// ── perilaku lama yang harus tetap ──
test('9. urutan biasa (rekening dikirim DULU, bukti sesudahnya) => 1, dasar "rekening"', () => {
  const hasil = cari([row({ menitLalu: 60, message: 'ok', reply_text: REKENING }), gambar(30, 'Terima kasih Ka')]);
  assert.equal(hasil.length, 1);
  assert.match(hasil[0].basis, /rekening/);
});
test('10. balasan atas gambar menyebut "bukti transfer ... sudah kami terima" => 1, dasar "mengakui"', () => {
  const hasil = cari([gambar(30, 'Bukti transfer Rp408.000-nya sudah kami terima ya Ka')]);
  assert.equal(hasil.length, 1);
  assert.match(hasil[0].basis, /mengakui/);
});
test('11. foto produk tanpa konteks bayar dan tanpa isyarat => 0', () => {
  assert.equal(cari([gambar(40, 'Untuk TB 168 BB 50 paling pas size S Ka.')]).length, 0);
});
test('12. foto produk lalu rekening dikirim SESUDAH (tanpa isyarat) => 0 (menghindari kasus palsu)', () => {
  assert.equal(cari([gambar(50, 'Untuk TB 168 BB 50 paling pas size S Ka.'), row({ menitLalu: 20, message: 'ok', reply_text: REKENING })]).length, 0);
});

// ── sudah tercakup => tidak ada kasus ──
test('13. sudah ada closing sesudah bukti => 0', () => {
  const inbox = [gambar(30, REKAP), row({ menitLalu: 29, message: 'udah ya' })];
  assert.equal(cari(inbox, { closings: [{ sender: S, created_at: at(10) }] }).length, 0);
});
test('14. sudah ada kasus Perlu Review untuk pesan itu => 0', () => {
  const bukti = gambar(30, REKAP);
  assert.equal(cari([bukti, row({ menitLalu: 29, message: 'udah ya' })], { escalations: [{ inbox_id: bukti.id, sender: S, created_at: at(5) }] }).length, 0);
});
test('15. nomor yang percakapannya diambil alih admin => 0', () => {
  assert.equal(cari([gambar(30, REKAP), row({ menitLalu: 29, message: 'udah ya' })], { handover: new Set([S]) }).length, 0);
});
test('16. gambar yang dilewati (skipped, ditangani admin) => 0', () => {
  assert.equal(cari([gambar(30, REKAP, { status: 'skipped' }), row({ menitLalu: 29, message: 'udah ya' })]).length, 0);
});
test('17. gambar belum 20 menit => belum dianggap tidak tertangani (0)', () => {
  assert.equal(cari([gambar(10, REKAP), row({ menitLalu: 9, message: 'udah ya' })]).length, 0);
});
test('18. satu kasus per nomor walau ada dua gambar', () => {
  assert.equal(cari([gambar(40, REKAP), row({ menitLalu: 39, message: 'udah ya' }), gambar(35, REKAP)]).length, 1);
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
