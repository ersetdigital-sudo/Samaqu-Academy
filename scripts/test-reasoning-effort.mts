/**
 * Uji pemilihan model bot WhatsApp dan parameter reasoning_effort (settings.ts + mimo-tools.ts).
 * Jalankan: npx tsx scripts/test-reasoning-effort.mts
 * Yang dikunci: (1) tanpa feature_models.wa, bot memakai default_model seperti dulu; (2) body request MiMo
 * IDENTIK dengan sebelumnya (tetap `thinking`, tanpa `reasoning_effort`); (3) `reasoning_effort:"off"` hanya
 * untuk DeepSeek dan menggantikan `thinking`; (4) harga DeepSeek dikenali untuk pencatatan biaya.
 */
import assert from 'node:assert/strict';
import { priceForModel, reasoningEffortFor, resolveWaModel } from '../supabase/functions/_shared/settings.ts';
import { mimoChatWithTools } from '../supabase/functions/_shared/mimo-tools.ts';

const cases: Array<[string, () => void | Promise<void>]> = [];
const test = (name: string, fn: () => void | Promise<void>) => cases.push([name, fn]);

const MIMO = 'xiaomi/mimo-v2.6-flash';
const DS = 'deepseek/deepseek-v4.1-flash';

// ── pemilihan model ──
test('1. feature_models kosong => bot memakai default_model (perilaku lama)', () => {
  assert.equal(resolveWaModel({ default_model: MIMO, feature_models: {} }), MIMO);
  assert.equal(resolveWaModel({ default_model: MIMO, feature_models: null }), MIMO);
});
test('2. feature_models.wa terisi => bot memakai model itu', () => {
  assert.equal(resolveWaModel({ default_model: MIMO, feature_models: { wa: DS } }), DS);
});
test('3. feature_models.wa kosong/spasi => kembali ke default_model (jalur rollback)', () => {
  assert.equal(resolveWaModel({ default_model: MIMO, feature_models: { wa: '' } }), MIMO);
  assert.equal(resolveWaModel({ default_model: MIMO, feature_models: { wa: '   ' } }), MIMO);
});
test('4. model fitur lain (assistant) tidak ikut mempengaruhi bot', () => {
  assert.equal(resolveWaModel({ default_model: MIMO, feature_models: { assistant: DS } }), MIMO);
});

// ── reasoning_effort ──
test('5. hanya DeepSeek yang mendapat reasoning_effort "off"', () => {
  assert.equal(reasoningEffortFor(DS), 'off');
  assert.equal(reasoningEffortFor('DeepSeek/deepseek-v4.1-flash'), 'off');
  for (const m of [MIMO, 'gpt-6-luna', 'z-ai/glm-5.3-flash', 'claude-haiku-5-5', '', null, undefined]) {
    assert.equal(reasoningEffortFor(m as string), undefined, `tidak boleh untuk ${String(m)}`);
  }
});

// ── harga ──
test('6. harga DeepSeek dikenali; MiMo flash tidak berubah', () => {
  assert.deepEqual(priceForModel(DS), { inputPer1M: 0.15, outputPer1M: 0.60, cachePer1M: 0.003, currency: 'USD' });
  assert.deepEqual(priceForModel(MIMO), { inputPer1M: 0.14, outputPer1M: 0.28, cachePer1M: 0.0028, currency: 'USD' });
  assert.equal(priceForModel('gpt-6-luna'), null);
});

// ── body request (fetch ditiru) ──
async function bodyFor(options: Record<string, unknown>): Promise<Record<string, any>> {
  const original = globalThis.fetch;
  let captured: Record<string, any> = {};
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    captured = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: {} }), { status: 200 });
  }) as typeof fetch;
  try {
    await mimoChatWithTools({
      apiKey: 'tes', baseUrl: 'https://example.test/v1', messages: [{ role: 'user', content: 'halo' }], tools: [],
      ...options,
    } as any);
  } finally {
    globalThis.fetch = original;
  }
  return captured;
}
test('7. MiMo (tanpa reasoningEffort): body tetap memuat thinking, TANPA reasoning_effort', async () => {
  const body = await bodyFor({ model: MIMO, thinking: 'disabled', maxTokens: 1500, temperature: 0.4 });
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal('reasoning_effort' in body, false);
  assert.equal(body.model, MIMO);
  assert.equal(body.max_completion_tokens, 1500);
  assert.equal(body.temperature, 0.4);
  assert.equal(body.tool_choice, 'auto');
  assert.equal(body.stream, false);
});
test('8. DeepSeek: body memuat reasoning_effort "off" dan TIDAK memuat thinking', async () => {
  const body = await bodyFor({ model: DS, thinking: 'disabled', reasoningEffort: 'off', maxTokens: 1500, temperature: 0.4 });
  assert.equal(body.reasoning_effort, 'off');
  assert.equal('thinking' in body, false);
  assert.equal(body.model, DS);
  assert.equal(body.max_completion_tokens, 1500);
  assert.equal(body.temperature, 0.4);
});
test('9. default tanpa opsi apa pun: tetap thinking disabled (perilaku lama)', async () => {
  const body = await bodyFor({ model: MIMO });
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal('reasoning_effort' in body, false);
  assert.equal(body.max_completion_tokens, 700);
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
