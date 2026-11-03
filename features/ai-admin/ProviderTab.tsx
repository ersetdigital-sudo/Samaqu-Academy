'use client';

import { useEffect, useState } from 'react';
import { useModal } from '@/components/providers/ModalProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/Note';
import type { AiPlan, AiSettings, AiSettingsPayload } from '@/lib/ai/admin';
import { PLAN_LABELS } from '@/lib/ai/admin';
import { invokeAiAdmin } from '@/lib/ai/remote';

interface ProviderTabProps {
  settings: AiSettings;
  encryptionReady: boolean;
  onUpdate: (payload: AiSettingsPayload) => void;
}

interface TestConnectionResult {
  message: string;
  modelCount: number;
  latencyMs: number;
}

export function ProviderTab({ settings, encryptionReady, onUpdate }: ProviderTabProps) {
  const { showToast } = useToast();
  const { openModal, closeModal } = useModal();
  const [plan, setPlan] = useState<AiPlan>(settings.plan);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [editingKey, setEditingKey] = useState(!settings.hasApiKey);
  const [busy, setBusy] = useState<'save' | 'test' | 'delete' | null>(null);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  useEffect(() => {
    setPlan(settings.plan);
    setBaseUrl(settings.baseUrl);
    setEditingKey(!settings.hasApiKey);
  }, [settings]);

  const save = async () => {
    if (!baseUrl.trim()) {
      showToast('Base URL wajib diisi', 'err');
      return;
    }
    if (apiKey.trim() && apiKey.trim().length < 8) {
      showToast('API Key terlihat tidak valid', 'err');
      return;
    }
    setBusy('save');
    const result = await invokeAiAdmin<AiSettingsPayload>('save_provider', {
      provider: 'xiaomi-mimo',
      plan,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim() || undefined,
    });
    setBusy(null);
    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Gagal menyimpan pengaturan', 'err');
      return;
    }
    onUpdate(result.data);
    setApiKey('');
    setShowKey(false);
    setEditingKey(!result.data.settings.hasApiKey);
    showToast('Pengaturan provider berhasil disimpan');
  };

  const testConnection = async () => {
    setBusy('test');
    setTestResult(null);
    const result = await invokeAiAdmin<TestConnectionResult>('test_connection', {
      apiKey: apiKey.trim() || undefined,
    });
    setBusy(null);
    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Tes koneksi gagal', 'err');
      return;
    }
    setTestResult(result.data);
    showToast('Koneksi ke Xiaomi MiMo berhasil');
  };

  const removeKey = () => {
    openModal(
      <ConfirmDialog
        title="Hapus API Key?"
        message="Fitur AI tidak akan memanggil Xiaomi MiMo sampai Owner menyimpan API Key baru. Riwayat percakapan tetap tersimpan."
        confirmLabel="Hapus API Key"
        onCancel={closeModal}
        onConfirm={async () => {
          setBusy('delete');
          const result = await invokeAiAdmin<AiSettingsPayload>('delete_key');
          setBusy(null);
          closeModal();
          if (!result.ok || !result.data) {
            showToast(result.error ?? 'Gagal menghapus API Key', 'err');
            return;
          }
          onUpdate(result.data);
          setTestResult(null);
          setApiKey('');
          setEditingKey(true);
          showToast('API Key berhasil dihapus');
        }}
      />,
    );
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card flat">
        <div className="row sp wrap">
          <div>
            <h2>Provider &amp; API Configuration</h2>
            <p className="sm muted mt1">
              Semua panggilan AI diproses di server Supabase Edge Function. API Key tidak pernah
              dikirim ke browser setelah disimpan.
            </p>
          </div>
          <span className={`ai-status ${settings.hasApiKey ? 'ok' : 'warn'}`}>
            {settings.hasApiKey ? 'API Key tersimpan' : 'Belum dikonfigurasi'}
          </span>
        </div>
      </div>

      {!encryptionReady ? (
        <Note variant="red" icon="shield-alert">
          <b>Server belum siap.</b> Secret <code>AI_SETTINGS_ENCRYPTION_KEY</code> belum diset pada
          Edge Function. API Key tidak dapat disimpan sebelum secret 32 byte (base64) tersebut
          dikonfigurasi.
        </Note>
      ) : null}

      <div className="card">
        <div className="ai-form-grid">
          <div>
            <label className="flab" htmlFor="ai-provider">
              AI Provider
            </label>
            <select id="ai-provider" className="inp" value="xiaomi-mimo" disabled>
              <option value="xiaomi-mimo">Xiaomi MiMo</option>
            </select>
            <p className="xs muted mt1">Provider awal yang terhubung ke Samaqu AI Brain.</p>
          </div>

          <div>
            <label className="flab" htmlFor="ai-plan">
              Konfigurasi Akun
            </label>
            <select
              id="ai-plan"
              className="inp"
              value={plan}
              onChange={(event) => setPlan(event.target.value as AiPlan)}
            >
              {(Object.keys(PLAN_LABELS) as AiPlan[]).map((value) => (
                <option key={value} value={value}>
                  {PLAN_LABELS[value]}
                </option>
              ))}
            </select>
            <p className="xs muted mt1">
              Pilih sesuai akun MiMo. Base URL tetap dapat diubah manual.
            </p>
          </div>

          <div className="full">
            <label className="flab" htmlFor="ai-base-url">
              Base URL
            </label>
            <input
              id="ai-base-url"
              className="inp"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.xiaomimimo.com/v1"
              spellCheck={false}
              autoComplete="off"
            />
            <p className="xs muted mt1">
              Default: <code>https://api.xiaomimimo.com/v1</code>. Gunakan URL khusus hanya bila
              akun MiMo memakai gateway berbeda.
            </p>
          </div>

          <div className="full">
            <label className="flab" htmlFor="ai-api-key">
              API Key
            </label>
            {settings.hasApiKey && !editingKey ? (
              <div className="ai-key-row">
                <div className="ai-key-box">
                  <Icon name="key" size={15} />
                  <span>•••• •••• •••• {settings.apiKeyLast4 ?? '••••'}</span>
                  <span className="tag gr" style={{ marginLeft: 'auto' }}>
                    Terenkripsi
                  </span>
                </div>
                <button className="btn sm" onClick={() => setEditingKey(true)}>
                  <Icon name="pencil" />
                  Ganti API Key
                </button>
                <button className="btn sm" onClick={removeKey} disabled={busy === 'delete'}>
                  <Icon name="trash-2" />
                  Hapus
                </button>
              </div>
            ) : (
              <>
                <div className="ai-key-row" style={{ flexWrap: 'nowrap' }}>
                  <input
                    id="ai-api-key"
                    className="inp"
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="Masukkan API Key Xiaomi MiMo"
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
                {settings.hasApiKey ? (
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
            <p className="xs muted mt1">
              Key disimpan terenkripsi AES-GCM di database server. Setelah disimpan, key tidak
              pernah ditampilkan lengkap lagi.
            </p>
          </div>
        </div>

        <div className="row wrap mt2">
          <button className="btn p" onClick={() => void save()} disabled={busy !== null}>
            <Icon name="save" />
            {busy === 'save' ? 'Menyimpan…' : 'Simpan Pengaturan'}
          </button>
          <button className="btn" onClick={() => void testConnection()} disabled={busy !== null}>
            <Icon name="refresh-cw" />
            {busy === 'test' ? 'Menguji…' : 'Tes Koneksi'}
          </button>
        </div>

        {testResult ? (
          <Note variant="green" icon="shield-check" className="mt">
            {testResult.message} Latensi {testResult.latencyMs} ms · {testResult.modelCount} model
            tersedia.
          </Note>
        ) : null}
      </div>

      <Note variant="neutral" icon="info">
        Informasi kuota dan tagihan mengikuti dashboard Xiaomi MiMo. Pemakaian token per permintaan
        dari aplikasi ini dicatat di tab <b>Usage &amp; Logs</b>.
      </Note>
    </div>
  );
}
