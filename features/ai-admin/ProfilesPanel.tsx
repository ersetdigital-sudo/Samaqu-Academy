'use client';

import { useEffect, useState } from 'react';
import { useModal } from '@/components/providers/ModalProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/Note';
import {
  FEATURE_MODEL_LABELS,
  PROFILE_PRESETS,
  type AiSettingsPayload,
  type ProfileModelInfo,
  type ProviderProfile,
  type ProviderProfileId,
} from '@/lib/ai/admin';
import { invokeAiAdmin } from '@/lib/ai/remote';

/**
 * Profil provider AI: Xiaomi MiMo (langsung), Command Code, dan Custom.
 *
 * Semua fitur AI (bot WA, Assistant, Reviewer) tetap membaca `ai_settings`; profil yang dipilih "aktif"
 * disalin ke sana oleh server dalam SATU transaksi, dan hanya setelah lolos tes. Kunci tiap profil
 * disimpan terpisah (terenkripsi), jadi pindah-balik tidak perlu mengetik ulang kunci.
 */

const FEATURES = ['assistant', 'reviewer', 'simulator'] as const;

type Busy =
  | 'save'
  | 'test'
  | 'models'
  | 'rollback'
  | 'delete'
  | `activate:${ProviderProfileId}`
  | null;

interface FormState {
  baseUrl: string;
  defaultModel: string;
  featureModels: Record<string, string>;
  inputPer1M: string;
  outputPer1M: string;
  currency: string;
}

function formFrom(profile: ProviderProfile | undefined): FormState {
  return {
    baseUrl: profile?.baseUrl ?? '',
    defaultModel: profile?.defaultModel ?? '',
    featureModels: {
      assistant: profile?.featureModels.assistant ?? '',
      reviewer: profile?.featureModels.reviewer ?? '',
      simulator: profile?.featureModels.simulator ?? '',
    },
    inputPer1M: profile?.pricing.inputPer1M != null ? String(profile.pricing.inputPer1M) : '',
    outputPer1M: profile?.pricing.outputPer1M != null ? String(profile.pricing.outputPer1M) : '',
    currency: profile?.pricing.currency ?? 'USD',
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url || '—';
  }
}

interface ProfilesPanelProps {
  payload: AiSettingsPayload;
  onUpdate: (payload: AiSettingsPayload) => void;
}

export function ProfilesPanel({ payload, onUpdate }: ProfilesPanelProps) {
  const { showToast } = useToast();
  const { openModal, closeModal } = useModal();
  const profiles = payload.profiles ?? [];
  const active = profiles.find((item) => item.id === payload.activeProfileId) ?? null;
  const previous = profiles.find((item) => item.id === payload.previousProfileId) ?? null;

  const [selected, setSelected] = useState<ProviderProfileId>(
    active?.id ?? profiles[0]?.id ?? 'commandcode',
  );
  const profile = profiles.find((item) => item.id === selected) ?? profiles[0];
  const preset = PROFILE_PRESETS[profile?.id ?? 'commandcode'];

  const [form, setForm] = useState<FormState>(() => formFrom(profile));
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [editingKey, setEditingKey] = useState(!profile?.hasApiKey);
  const [busy, setBusy] = useState<Busy>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [retry, setRetry] = useState<{ kind: 'save' | 'activate'; id: ProviderProfileId } | null>(null);
  const [models, setModels] = useState<ProfileModelInfo[]>([]);
  const [filter, setFilter] = useState('');

  // Isi ulang form hanya saat profil terpilih atau datanya benar-benar berubah (bukan tiap payload baru),
  // supaya ketikan yang belum disimpan tidak terhapus.
  useEffect(() => {
    if (!profile) return;
    setForm(formFrom(profile));
    setApiKey('');
    setShowKey(false);
    setEditingKey(!profile.hasApiKey);
    setResult(null);
    setRetry(null);
    setModels([]);
    setFilter('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.baseUrl, profile?.defaultModel, profile?.hasApiKey, profile?.apiKeyLast4]);

  if (!profile) {
    return (
      <Note variant="warn" icon="info">
        Profil provider belum tersedia. Muat ulang halaman ini.
      </Note>
    );
  }

  const patch = (partial: Partial<FormState>) => setForm((previousForm) => ({ ...previousForm, ...partial }));

  const finish = (
    response: { ok: boolean; data?: AiSettingsPayload; error?: string },
    kind: 'save' | 'activate',
    success: string,
  ) => {
    setBusy(null);
    if (!response.ok || !response.data) {
      const message = response.error ?? 'Permintaan gagal diproses.';
      setResult({ ok: false, message });
      // Penolakan karena TES gagal: tawarkan jalan keluar sadar (lanjut tanpa tes).
      setRetry(/^Tes /.test(message) ? { kind, id: profile.id } : null);
      showToast(kind === 'save' ? 'Gagal menyimpan' : 'Gagal memindah provider', 'err');
      return false;
    }
    setRetry(null);
    setResult({ ok: true, message: response.data.message ?? success });
    onUpdate(response.data);
    showToast(success);
    return true;
  };

  const save = async (skipTest = false) => {
    if (!form.defaultModel.trim()) {
      showToast('Model default wajib diisi', 'err');
      return;
    }
    if (apiKey.trim() && apiKey.trim().length < 8) {
      showToast('API Key terlihat tidak valid', 'err');
      return;
    }
    setBusy('save');
    setResult(null);
    const response = await invokeAiAdmin<AiSettingsPayload>('save_profile', {
      id: profile.id,
      baseUrl: form.baseUrl.trim(),
      apiKey: apiKey.trim() || undefined,
      defaultModel: form.defaultModel.trim(),
      featureModels: form.featureModels,
      pricing: {
        inputPer1M: form.inputPer1M.trim(),
        outputPer1M: form.outputPer1M.trim(),
        currency: form.currency.trim() || 'USD',
      },
      skipTest: skipTest || undefined,
    });
    finish(response, 'save', profile.isActive ? 'Tersimpan dan langsung berlaku' : 'Profil tersimpan');
  };

  const test = async () => {
    setBusy('test');
    setResult(null);
    const response = await invokeAiAdmin<{ message: string }>('test_profile', {
      id: profile.id,
      baseUrl: form.baseUrl.trim() || undefined,
      apiKey: apiKey.trim() || undefined,
      model: form.defaultModel.trim() || undefined,
    });
    setBusy(null);
    if (!response.ok || !response.data) {
      setResult({ ok: false, message: response.error ?? 'Tes gagal' });
      return;
    }
    setResult({ ok: true, message: response.data.message });
  };

  const loadModels = async () => {
    setBusy('models');
    const response = await invokeAiAdmin<{ models: ProfileModelInfo[]; count: number }>('list_profile_models', {
      id: profile.id,
      baseUrl: form.baseUrl.trim() || undefined,
      apiKey: apiKey.trim() || undefined,
    });
    setBusy(null);
    if (!response.ok || !response.data) {
      showToast(response.error ?? 'Gagal memuat daftar model', 'err');
      return;
    }
    setModels(response.data.models);
    showToast(`${response.data.count} model dimuat`);
  };

  const doActivate = async (id: ProviderProfileId, skipTest = false) => {
    setBusy(`activate:${id}`);
    setResult(null);
    const response = await invokeAiAdmin<AiSettingsPayload>('activate_profile', { id, skipTest: skipTest || undefined });
    if (finish(response, 'activate', 'Provider aktif berubah') && response.data) {
      setSelected(id);
    }
  };

  const askActivate = (target: ProviderProfile) => {
    openModal(
      <div style={{ textAlign: 'center', padding: '8px 4px' }}>
        <div className="sic" style={{ margin: '0 auto', width: 44, height: 44 }}>
          <Icon name="repeat" size={19} />
        </div>
        <h2 className="mt">Pindah ke {target.label}?</h2>
        <div className="sm muted mt1">
          Bot WA, Knowledge Assistant, dan Chat Reviewer akan memakai <b>{target.label}</b> dengan model{' '}
          <code>{target.defaultModel}</code>. Sistem menguji dulu; kalau tes gagal, tidak jadi pindah. Sebaiknya
          lakukan di luar jam kerja AI.
        </div>
        <div className="row mt2" style={{ justifyContent: 'center' }}>
          <button className="btn" type="button" onClick={closeModal}>
            Batal
          </button>
          <button
            className="btn p"
            type="button"
            onClick={() => {
              closeModal();
              void doActivate(target.id);
            }}
          >
            Tes &amp; Pindah
          </button>
        </div>
      </div>,
    );
  };

  const askRollback = () => {
    if (!previous) return;
    openModal(
      <div style={{ textAlign: 'center', padding: '8px 4px' }}>
        <div className="sic" style={{ margin: '0 auto', width: 44, height: 44 }}>
          <Icon name="arrow-left" size={19} />
        </div>
        <h2 className="mt">Kembali ke {previous.label}?</h2>
        <div className="sm muted mt1">
          Semua fitur AI memakai lagi {previous.label} (model <code>{previous.defaultModel}</code>) dengan kunci
          yang sudah tersimpan di profilnya. Sistem menguji dulu sebelum pindah.
        </div>
        <div className="row mt2" style={{ justifyContent: 'center' }}>
          <button className="btn" type="button" onClick={closeModal}>
            Batal
          </button>
          <button
            className="btn p"
            type="button"
            onClick={async () => {
              closeModal();
              setBusy('rollback');
              setResult(null);
              const response = await invokeAiAdmin<AiSettingsPayload>('rollback_profile', {});
              finish(response, 'activate', 'Dikembalikan ke profil sebelumnya');
            }}
          >
            Tes &amp; Kembali
          </button>
        </div>
      </div>,
    );
  };

  const removeKey = () => {
    openModal(
      <ConfirmDialog
        title={`Hapus API Key ${profile.label}?`}
        message="Profil ini tidak bisa diaktifkan lagi sampai kuncinya diisi ulang. Profil yang sedang aktif tidak terpengaruh."
        confirmLabel="Hapus API Key"
        onCancel={closeModal}
        onConfirm={async () => {
          setBusy('delete');
          const response = await invokeAiAdmin<AiSettingsPayload>('delete_profile_key', { id: profile.id });
          setBusy(null);
          closeModal();
          if (!response.ok || !response.data) {
            showToast(response.error ?? 'Gagal menghapus API Key', 'err');
            return;
          }
          onUpdate(response.data);
          setEditingKey(true);
          showToast('API Key dihapus');
        }}
      />,
    );
  };

  const needle = filter.trim().toLowerCase();
  const chatModels = models.filter((item) => item.chat);
  const hiddenCount = models.length - chatModels.length;
  const shownModels = chatModels.filter((item) => !needle || item.id.toLowerCase().includes(needle)).slice(0, 80);
  const anyBusy = busy !== null;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card flat">
        <div className="row sp wrap">
          <div>
            <h2>Provider AI</h2>
            <p className="sm muted mt1">
              Pilih provider yang dipakai semua fitur AI. Kunci tiap provider tersimpan terpisah (terenkripsi),
              jadi pindah dan kembali tidak perlu mengetik ulang kunci.
            </p>
          </div>
          {previous ? (
            <button className="btn" onClick={askRollback} disabled={anyBusy}>
              <Icon name="arrow-left" />
              {busy === 'rollback' ? 'Menguji…' : `Kembali ke ${previous.label}`}
            </button>
          ) : null}
        </div>
      </div>

      {active ? (
        <Note variant="green" icon="shield-check">
          Aktif sekarang: <b>{active.label}</b> · model <code>{active.defaultModel}</code> · kunci ••••{' '}
          {active.apiKeyLast4 ?? '••••'}. Berlaku untuk bot WA, Knowledge Assistant, dan Chat Reviewer.
        </Note>
      ) : (
        <Note variant="warn" icon="info">
          Belum ada profil yang aktif. Isi kunci pada salah satu profil lalu klik <b>Jadikan aktif</b>.
        </Note>
      )}

      <div className="ai-prof-grid">
        {profiles.map((item) => {
          const ready = item.hasApiKey && item.baseUrl.trim() !== '' && item.defaultModel.trim() !== '';
          return (
            <div
              key={item.id}
              className={`ai-prof-card${item.isActive ? ' on' : ''}${item.id === profile.id ? ' sel' : ''}`}
            >
              <div className="row sp wrap" style={{ gap: 6 }}>
                <b>{item.label}</b>
                {item.isActive ? <span className="tag gr">Aktif</span> : null}
              </div>
              <dl className="ai-prof-meta">
                <div>
                  <dt>Alamat</dt>
                  <dd>{hostOf(item.baseUrl)}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{item.defaultModel || '—'}</dd>
                </div>
                <div>
                  <dt>Kunci</dt>
                  <dd>{item.hasApiKey ? `•••• ${item.apiKeyLast4 ?? ''}` : 'Belum ada'}</dd>
                </div>
              </dl>
              <div className="row wrap" style={{ gap: 8 }}>
                <button className="btn sm" onClick={() => setSelected(item.id)} disabled={anyBusy}>
                  <Icon name="pencil" />
                  Atur
                </button>
                {!item.isActive ? (
                  <button
                    className="btn sm p"
                    onClick={() => askActivate(item)}
                    disabled={anyBusy || !ready}
                    title={ready ? undefined : 'Isi kunci, alamat, dan model dulu'}
                  >
                    {busy === `activate:${item.id}` ? 'Menguji…' : 'Jadikan aktif'}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="row sp wrap">
          <h2>
            Atur: {profile.label}
          </h2>
          {profile.isActive ? <span className="ai-status ok">Sedang dipakai</span> : <span className="ai-status warn">Belum aktif</span>}
        </div>
        {profile.isActive ? (
          <p className="sm muted mt1">
            Profil ini sedang dipakai bot. Perubahan alamat, kunci, atau model diuji dulu, dan hanya disimpan kalau
            lolos.
          </p>
        ) : null}

        <div className="ai-form-grid mt">
          <div className="full">
            <label className="flab" htmlFor="prof-base-url">
              Base URL
            </label>
            <input
              id="prof-base-url"
              className="inp"
              value={form.baseUrl}
              onChange={(event) => patch({ baseUrl: event.target.value })}
              placeholder={preset.baseUrl || 'https://api.contoh.com/v1'}
              spellCheck={false}
              autoComplete="off"
            />
            <p className="xs muted mt1">{preset.urlHint}</p>
          </div>

          <div className="full">
            <label className="flab" htmlFor="prof-api-key">
              API Key
            </label>
            {profile.hasApiKey && !editingKey ? (
              <div className="ai-key-row">
                <div className="ai-key-box">
                  <Icon name="key" size={15} />
                  <span>•••• •••• •••• {profile.apiKeyLast4 ?? '••••'}</span>
                  <span className="tag gr" style={{ marginLeft: 'auto' }}>
                    Terenkripsi
                  </span>
                </div>
                <button className="btn sm" onClick={() => setEditingKey(true)} disabled={anyBusy}>
                  <Icon name="pencil" />
                  Ganti API Key
                </button>
                {!profile.isActive ? (
                  <button className="btn sm" onClick={removeKey} disabled={anyBusy}>
                    <Icon name="trash-2" />
                    Hapus
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                <div className="ai-key-row" style={{ flexWrap: 'nowrap' }}>
                  <input
                    id="prof-api-key"
                    className="inp"
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={`Masukkan API Key ${profile.label}`}
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                  <button
                    className="btn sm"
                    type="button"
                    onClick={() => setShowKey((value) => !value)}
                    aria-label={showKey ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
                  >
                    <Icon name={showKey ? 'eye-off' : 'eye'} />
                  </button>
                </div>
                {profile.hasApiKey ? (
                  <button
                    className="btn sm mt1"
                    onClick={() => {
                      setEditingKey(false);
                      setApiKey('');
                    }}
                  >
                    Batal ganti
                  </button>
                ) : null}
              </>
            )}
            <p className="xs muted mt1">{preset.keyHint}</p>
          </div>

          <div className="full">
            <label className="flab" htmlFor="prof-model">
              Model default
            </label>
            <input
              id="prof-model"
              className="inp"
              value={form.defaultModel}
              onChange={(event) => patch({ defaultModel: event.target.value })}
              placeholder={preset.modelHints[0] ?? 'id model'}
              spellCheck={false}
              autoComplete="off"
            />
            {preset.modelHints.length ? (
              <div className="row wrap mt1" style={{ gap: 6 }}>
                <span className="xs muted">Pilih cepat:</span>
                {preset.modelHints.map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    className={`btn sm${form.defaultModel === hint ? ' p' : ''}`}
                    onClick={() => patch({ defaultModel: hint })}
                  >
                    {hint}
                  </button>
                ))}
              </div>
            ) : null}
            <p className="xs muted mt1">{preset.modelHint}</p>
          </div>
        </div>

        <div className="row wrap mt">
          <button className="btn" onClick={() => void loadModels()} disabled={anyBusy || !(profile.hasApiKey || apiKey.trim())}>
            <Icon name="refresh-cw" />
            {busy === 'models' ? 'Memuat…' : 'Muat daftar model'}
          </button>
        </div>

        {models.length ? (
          <div className="ai-model-pick mt1">
            <input
              className="inp"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={`Cari di ${chatModels.length} model…`}
              aria-label="Cari model"
              spellCheck={false}
            />
            <div className="ai-model-list" role="listbox" aria-label="Daftar model">
              {shownModels.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={form.defaultModel === item.id}
                  className={`ai-model-item${form.defaultModel === item.id ? ' on' : ''}`}
                  onClick={() => patch({ defaultModel: item.id })}
                >
                  {item.id}
                </button>
              ))}
              {!shownModels.length ? <span className="xs muted">Tidak ada model yang cocok.</span> : null}
            </div>
            {hiddenCount > 0 ? (
              <p className="xs muted mt1">
                {hiddenCount} model lain disembunyikan karena tidak melayani <code>/chat/completions</code> (mis.
                model Claude di Command Code): bot WA memakai format itu.
              </p>
            ) : null}
          </div>
        ) : null}

        <h3 className="mt2">Model per fitur (opsional)</h3>
        <p className="xs muted mt1">Kosongkan untuk mengikuti model default. Bot WA selalu memakai model default.</p>
        <div className="ai-form-grid mt1">
          {FEATURES.map((feature) => (
            <div key={feature}>
              <label className="flab" htmlFor={`prof-model-${feature}`}>
                {FEATURE_MODEL_LABELS[feature]}
              </label>
              <input
                id={`prof-model-${feature}`}
                className="inp"
                value={form.featureModels[feature] ?? ''}
                onChange={(event) => patch({ featureModels: { ...form.featureModels, [feature]: event.target.value } })}
                placeholder={`Ikuti default (${form.defaultModel || '-'})`}
                spellCheck={false}
              />
            </div>
          ))}
        </div>

        <h3 className="mt2">Harga token (opsional)</h3>
        <p className="xs muted mt1">
          Untuk estimasi biaya di Usage &amp; Logs. Kosongkan bila ingin memakai harga bawaan menurut nama model.
        </p>
        <div className="ai-form-grid mt1" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <div>
            <label className="flab" htmlFor="prof-price-in">
              Input / 1 juta token
            </label>
            <input id="prof-price-in" className="inp" inputMode="decimal" value={form.inputPer1M} onChange={(event) => patch({ inputPer1M: event.target.value })} placeholder="0" />
          </div>
          <div>
            <label className="flab" htmlFor="prof-price-out">
              Output / 1 juta token
            </label>
            <input id="prof-price-out" className="inp" inputMode="decimal" value={form.outputPer1M} onChange={(event) => patch({ outputPer1M: event.target.value })} placeholder="0" />
          </div>
          <div>
            <label className="flab" htmlFor="prof-price-cur">
              Mata uang
            </label>
            <input id="prof-price-cur" className="inp" value={form.currency} onChange={(event) => patch({ currency: event.target.value })} placeholder="USD" />
          </div>
        </div>

        <div className="row wrap mt2">
          <button className="btn p" onClick={() => void save()} disabled={anyBusy}>
            <Icon name="save" />
            {busy === 'save' ? (profile.isActive ? 'Menguji & menyimpan…' : 'Menyimpan…') : 'Simpan'}
          </button>
          <button className="btn" onClick={() => void test()} disabled={anyBusy || !(profile.hasApiKey || apiKey.trim())}>
            <Icon name="play" />
            {busy === 'test' ? 'Menguji…' : 'Tes model'}
          </button>
        </div>

        {result ? (
          <Note variant={result.ok ? 'green' : 'red'} icon={result.ok ? 'shield-check' : 'shield-alert'} className="mt">
            {result.message}
            {!result.ok && retry ? (
              <div className="mt1">
                <button
                  className="btn sm"
                  disabled={anyBusy}
                  onClick={() => (retry.kind === 'save' ? void save(true) : void doActivate(retry.id, true))}
                >
                  Tetap lanjutkan tanpa tes (tidak disarankan)
                </button>
              </div>
            ) : null}
          </Note>
        ) : null}
      </div>

      <Note variant="neutral" icon="info">
        Pemakaian token per permintaan dicatat di tab <b>Usage &amp; Logs</b>. Tagihan dan kuota mengikuti dashboard
        masing-masing provider.
      </Note>
    </div>
  );
}

/** Tab Model saat profil aktif: model kini diatur per profil di tab Provider & API. */
export function ProfileModelsNotice({
  payload,
  onGoProvider,
}: {
  payload: AiSettingsPayload;
  onGoProvider: () => void;
}) {
  const active = (payload.profiles ?? []).find((item) => item.id === payload.activeProfileId) ?? null;
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2>Model</h2>
        <p className="sm muted mt1">
          Model default, model per fitur, dan harga token sekarang diatur <b>per profil provider</b> di tab
          Provider &amp; API, supaya pindah provider selalu membawa model yang cocok.
        </p>
        {active ? (
          <dl className="ai-prof-meta mt">
            <div>
              <dt>Provider aktif</dt>
              <dd>{active.label}</dd>
            </div>
            <div>
              <dt>Model default</dt>
              <dd>{active.defaultModel}</dd>
            </div>
            {FEATURES.map((feature) => (
              <div key={feature}>
                <dt>{FEATURE_MODEL_LABELS[feature]}</dt>
                <dd>{active.featureModels[feature] || `Ikuti default`}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <button className="btn p mt2" onClick={onGoProvider}>
          <Icon name="key" />
          Atur di Provider &amp; API
        </button>
      </div>
    </div>
  );
}
