/**
 * Uji keadaan awal form terkunci (features/ai-admin/ProfilesPanel.tsx dan BehaviorTab.tsx), render sisi server.
 * Jalankan: npx tsx scripts/test-ai-admin-lock.mts
 * Yang dikunci: profil/perilaku yang SUDAH tersimpan tampil terkunci (kolom hanya-baca, tombol "Edit", TANPA "Simpan"),
 * sedangkan profil kosong (belum pernah disimpan) tetap terbuka dengan tombol "Simpan" dan tanpa "Batal".
 * Klik Edit/Simpan/Batal tidak teruji di sini (tanpa DOM); itu diverifikasi manual di halaman live.
 */
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModalProvider } from '../components/providers/ModalProvider.tsx';
import { ToastProvider } from '../components/providers/ToastProvider.tsx';
import { BehaviorTab } from '../features/ai-admin/BehaviorTab.tsx';
import { ProfilesPanel } from '../features/ai-admin/ProfilesPanel.tsx';

const behavior = {
  assistantName: 'Samaqu AI Brain', language: 'id', character: 'ramah', systemInstructions: 'Instruksi uji',
  responseLength: 'sedang', maxTokens: 1500, temperature: 0.4, knowledgeRules: 'aturan', memoryRules: 'aturan',
};
const settings = { behavior } as any;

const profile = (over: Record<string, unknown> = {}) => ({
  id: 'commandcode', label: 'Command Code', baseUrl: 'https://api.commandcode.ai/provider/v1', hasApiKey: true, apiKeyLast4: 'dfoL',
  defaultModel: 'deepseek/deepseek-v4.1-flash', featureModels: { assistant: 'xiaomi/mimo-v2.6-flash' },
  pricing: { inputPer1M: 0.435, outputPer1M: 0.87, currency: 'USD' }, isActive: true, lastActiveAt: null, ...over,
});
const payload = (p: Record<string, unknown>) => ({
  settings, defaults: behavior, encryptionReady: true, profilesReady: true, profiles: [p], activeProfileId: p.id, previousProfileId: null,
}) as any;

const wrap = (child: any) => createElement(ModalProvider, null, createElement(ToastProvider, null, child));
const render = (child: any) => renderToStaticMarkup(wrap(child));
const count = (html: string, re: RegExp) => (html.match(re) || []).length;
const hasButton = (html: string, label: string) => new RegExp(`<button[^>]*>(?:<[^>]+>)*\\s*${label}\\s*</button>`).test(html);

const cases: Array<[string, () => void]> = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

test('1. BehaviorTab: terkunci (Edit ada, Simpan/Batal/Kembalikan tidak ada)', () => {
  const html = render(createElement(BehaviorTab, { settings, defaults: behavior as any, onUpdate: () => {} }));
  assert.equal(hasButton(html, 'Edit'), true, 'tombol Edit harus ada');
  assert.equal(hasButton(html, 'Simpan'), false, 'Simpan tidak boleh tampil saat terkunci');
  assert.equal(hasButton(html, 'Batal'), false);
  assert.equal(hasButton(html, 'Kembalikan ke Default'), false);
  assert.match(html, /Terkunci\. Klik Edit/);
});
test('2. BehaviorTab: semua kolom perilaku hanya-baca/nonaktif', () => {
  const html = render(createElement(BehaviorTab, { settings, defaults: behavior as any, onUpdate: () => {} }));
  // 2 input teks + 1 angka + 3 textarea hanya-baca; 2 select + 1 slider nonaktif.
  assert.equal(count(html, /<textarea[^>]*readOnly/g), 3);
  assert.equal(count(html, /<input[^>]*readOnly/g), 3);
  assert.equal(count(html, /<select[^>]*disabled/g), 2);
  assert.equal(count(html, /<input[^>]*type="range"[^>]*disabled|<input[^>]*disabled[^>]*type="range"/g), 1);
});
test('3. ProfilesPanel: profil tersimpan tampil terkunci (Edit ada, Simpan/Batal tidak ada, Tes model tetap ada)', () => {
  const html = render(createElement(ProfilesPanel, { payload: payload(profile()), onUpdate: () => {} }));
  assert.equal(hasButton(html, 'Edit'), true);
  assert.equal(hasButton(html, 'Simpan'), false);
  assert.equal(hasButton(html, 'Batal'), false);
  assert.equal(hasButton(html, 'Tes model'), true, 'Tes model harus tetap tersedia');
});
test('4. ProfilesPanel: kolom model, URL, fitur, dan harga hanya-baca; pilih cepat dan muat daftar nonaktif', () => {
  const html = render(createElement(ProfilesPanel, { payload: payload(profile()), onUpdate: () => {} }));
  for (const id of ['prof-base-url', 'prof-model', 'prof-model-assistant', 'prof-model-reviewer', 'prof-model-simulator', 'prof-price-in', 'prof-price-out', 'prof-price-cur']) {
    assert.match(html, new RegExp(`<input[^>]*id="${id}"[^>]*readOnly|<input[^>]*readOnly[^>]*id="${id}"`), `${id} harus hanya-baca`);
  }
  assert.match(html, /<button[^>]*disabled[^>]*>(?:<[^>]+>)*\s*Ganti API Key/);
  assert.match(html, /<button[^>]*disabled[^>]*>(?:<[^>]+>)*\s*Muat daftar model/);
});
test('5. ProfilesPanel: profil KOSONG (belum pernah disimpan) tetap terbuka: Simpan ada, Edit dan Batal tidak ada', () => {
  const kosong = profile({ defaultModel: '', baseUrl: '', hasApiKey: false, apiKeyLast4: null, featureModels: {}, pricing: {}, isActive: false });
  const html = render(createElement(ProfilesPanel, { payload: payload(kosong), onUpdate: () => {} }));
  assert.equal(hasButton(html, 'Simpan'), true, 'profil kosong harus bisa langsung diisi');
  assert.equal(hasButton(html, 'Edit'), false);
  assert.equal(hasButton(html, 'Batal'), false, 'tidak ada isi tersimpan untuk dikembalikan');
  assert.doesNotMatch(html, /<input[^>]*id="prof-model"[^>]*readOnly/);
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
