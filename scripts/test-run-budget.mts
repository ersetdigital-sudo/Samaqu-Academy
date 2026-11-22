/**
 * Uji anggaran waktu run bot (wa-agent/run-budget.ts).
 * Jalankan: npx tsx scripts/test-run-budget.mts
 */
import assert from 'node:assert/strict';
import {
  planRound,
  RUN_LOOP_BUDGET_MS,
  MIN_ROUND_MS,
  MAX_MODEL_TIMEOUT_MS,
  FIRST_ROUND_MIN_TIMEOUT_MS,
} from '../supabase/functions/wa-agent/run-budget.ts';

let passed = 0;
const cases: Array<[string, () => void]> = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

test('ronde pertama di awal run: jalan, waktu tunggu penuh 90 detik', () => {
  const plan = planRound(5_000, 0);
  assert.equal(plan.go, true);
  assert.equal(plan.timeoutMs, MAX_MODEL_TIMEOUT_MS);
});
test('ronde pertama SELALU jalan walau anggaran sudah habis oleh persiapan', () => {
  for (const elapsed of [60_000, 99_000, 100_000, 140_000, 400_000]) {
    const plan = planRound(elapsed, 0);
    assert.equal(plan.go, true, `elapsed ${elapsed}`);
    assert.ok(plan.timeoutMs >= FIRST_ROUND_MIN_TIMEOUT_MS && plan.timeoutMs <= MAX_MODEL_TIMEOUT_MS, `timeout ${plan.timeoutMs}`);
  }
});
test('ronde pertama dengan persiapan 30 detik: waktu tunggu 70 detik (sisa anggaran)', () => {
  assert.deepEqual(planRound(30_000, 0), { go: true, timeoutMs: 70_000 });
});
test('ronde berikutnya jalan selama sisa anggaran cukup, waktu tunggu dipotong sisa anggaran', () => {
  assert.deepEqual(planRound(20_000, 1), { go: true, timeoutMs: 80_000 });
  assert.deepEqual(planRound(60_000, 2), { go: true, timeoutMs: 40_000 });
  assert.deepEqual(planRound(79_000, 3), { go: true, timeoutMs: 21_000 });
});
test('ronde berikutnya berhenti kalau sisa anggaran kurang dari batas minimum', () => {
  assert.deepEqual(planRound(80_001, 1), { go: false, timeoutMs: 0 });
  assert.deepEqual(planRound(95_000, 4), { go: false, timeoutMs: 0 });
  assert.deepEqual(planRound(130_000, 2), { go: false, timeoutMs: 0 });
});
test('batas tepat: sisa sama dengan batas minimum masih jalan', () => {
  assert.equal(planRound(RUN_LOOP_BUDGET_MS - MIN_ROUND_MS, 1).go, true);
});
test('waktu tunggu tidak pernah melebihi 90 detik dan tidak pernah melewati anggaran', () => {
  for (let elapsed = 0; elapsed <= 120_000; elapsed += 1_000) {
    for (const round of [1, 2, 5]) {
      const plan = planRound(elapsed, round);
      if (plan.go) {
        assert.ok(plan.timeoutMs <= MAX_MODEL_TIMEOUT_MS);
        assert.ok(elapsed + plan.timeoutMs <= RUN_LOOP_BUDGET_MS + 1, `ronde ${round} elapsed ${elapsed}`);
      }
    }
  }
});
test('masukan aneh tidak merusak: NaN, negatif, undefined dianggap awal run', () => {
  assert.equal(planRound(Number.NaN, 0).go, true);
  assert.equal(planRound(-5, 1).go, true);
  assert.equal(planRound(undefined as unknown as number, 1).go, true);
});
test('worst case: tidak ada ronde yang bisa berakhir lewat anggaran + waktu tool 20 detik di bawah 150 detik', () => {
  // ronde berikutnya (>0) berakhir paling lambat di anggaran; tool + penutupan run diberi 25 detik.
  assert.ok(RUN_LOOP_BUDGET_MS + 25_000 < 150_000);
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
