/**
 * Uji penyaring pesan jam kerja admin (_shared/wa/schedule.mjs: isAdminHoursMessage, adminHoursWindows).
 * Jalankan: npx tsx scripts/test-admin-hours.mts
 */
import assert from 'node:assert/strict';
import { adminHoursWindows, isAdminHoursMessage, isWaOnline } from '../supabase/functions/_shared/wa/schedule.mjs';

const wib = (iso: string) => new Date(`${iso}+07:00`);
// 2026-11-23 = Senin, 22 = Minggu, 21 = Sabtu.

const cases: Array<[string, () => void]> = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

test('Senin 08.00 = jam admin', () => assert.equal(isAdminHoursMessage(wib('2026-11-23T08:00:00')), true));
test('Senin 07.29 = bukan (masih jam bot)', () => assert.equal(isAdminHoursMessage(wib('2026-11-23T07:29:59')), false));
test('Senin 07.30 = mulai jam admin', () => assert.equal(isAdminHoursMessage(wib('2026-11-23T07:30:00')), true));
test('Senin 16.39 = masih jam admin (penyangga)', () => assert.equal(isAdminHoursMessage(wib('2026-11-23T16:39:59')), true));
test('Senin 16.40 = bot yang membalas', () => assert.equal(isAdminHoursMessage(wib('2026-11-23T16:40:00')), false));
test('Sabtu 12.00 = jam admin', () => assert.equal(isAdminHoursMessage(wib('2026-11-21T12:00:00')), true));
test('Sabtu 16.41 = bot', () => assert.equal(isAdminHoursMessage(wib('2026-11-21T16:41:00')), false));
test('Minggu 12.00 = bukan jam admin (bot penuh)', () => assert.equal(isAdminHoursMessage(wib('2026-11-22T12:00:00')), false));
test('Selasa 03.00 = bukan jam admin', () => assert.equal(isAdminHoursMessage(wib('2026-11-24T03:00:00')), false));

test('jadwal bot (isWaOnline) TIDAK berubah: 16.30 online, 16.29 offline, Minggu online', () => {
  assert.equal(isWaOnline(wib('2026-11-23T16:30:00')), true);
  assert.equal(isWaOnline(wib('2026-11-23T16:29:00')), false);
  assert.equal(isWaOnline(wib('2026-11-22T12:00:00')), true);
});

test('rentang jam admin: Senin 16.35 -> Senin (dipotong 16.35) + Sabtu; Minggu dilewati', () => {
  const w = adminHoursWindows(wib('2026-11-23T16:35:00').getTime(), 3);
  assert.equal(w.length, 2);
  assert.equal(w[0].from, wib('2026-11-23T07:30:00').toISOString());
  assert.equal(w[0].to, wib('2026-11-23T16:35:00').toISOString());
  assert.equal(w[1].from, wib('2026-11-21T07:30:00').toISOString());
  assert.equal(w[1].to, wib('2026-11-21T16:40:00').toISOString());
});

test('rentang jam admin: Senin 07.00 -> hari ini belum mulai, hanya Sabtu', () => {
  const w = adminHoursWindows(wib('2026-11-23T07:00:00').getTime(), 3);
  assert.equal(w.length, 1);
  assert.equal(w[0].from, wib('2026-11-21T07:30:00').toISOString());
});

test('rentang jam admin: Selasa 20.00 -> Selasa penuh 16.40, Senin penuh, Minggu dilewati', () => {
  const w = adminHoursWindows(wib('2026-11-24T20:00:00').getTime(), 3);
  assert.equal(w.length, 2);
  assert.equal(w[0].to, wib('2026-11-24T16:40:00').toISOString());
  assert.equal(w[1].to, wib('2026-11-23T16:40:00').toISOString());
});

test('rentang jam admin: Minggu malam -> hanya Sabtu, tidak ada rentang Minggu', () => {
  const w = adminHoursWindows(wib('2026-11-22T21:00:00').getTime(), 3);
  assert.equal(w.length, 2); // Sabtu 21 dan Jumat 20
  assert.equal(w[0].to, wib('2026-11-21T16:40:00').toISOString());
});

let passed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    passed += 1;
    console.log(`OK    ${name}`);
  } catch (error) {
    console.log(`GAGAL ${name}\n      ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${cases.length} lulus`);
