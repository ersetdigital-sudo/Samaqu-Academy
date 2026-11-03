'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/Note';
import {
  FEATURE_MODEL_LABELS,
  type AiPricing,
  type AiSettings,
  type AiSettingsPayload,
  type MimoModel,
} from '@/lib/ai/admin';
import { invokeAiAdmin } from '@/lib/ai/remote';

interface ModelsTabProps {
  settings: AiSettings;
  onUpdate: (payload: AiSettingsPayload) => void;
}

interface ModelsResponse {
  models: MimoModel[];
  cached?: boolean;
  fetchedAt?: string;
}

interface TestModelResponse {
  message: string;
  model: string;
  reply: string;
  latencyMs: number;
}

const FEATURES = ['assistant', 'reviewer', 'simulator'] as const;

export function ModelsTab({ settings, onUpdate }: ModelsTabProps) {
  const { showToast } = useToast();
  const [models, setModels] = useState<MimoModel[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [defaultModel, setDefaultModel] = useState(settings.defaultModel);
  const [featureModels, setFeatureModels] = useState<Record<string, string>>({
    assistant: settings.featureModels.assistant ?? '',
    reviewer: settings.featureModels.reviewer ?? '',
    simulator: settings.featureModels.simulator ?? '',
  });
  const [inputPer1M, setInputPer1M] = useState(
    settings.pricing.inputPer1M != null ? String(settings.pricing.inputPer1M) : '',
  );
  const [outputPer1M, setOutputPer1M] = useState(
    settings.pricing.outputPer1M != null ? String(settings.pricing.outputPer1M) : '',
  );
  const [currency, setCurrency] = useState(settings.pricing.currency ?? 'USD');
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    key: string;
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    setDefaultModel(settings.defaultModel);
    setFeatureModels({
      assistant: settings.featureModels.assistant ?? '',
      reviewer: settings.featureModels.reviewer ?? '',
      simulator: settings.featureModels.simulator ?? '',
    });
    setInputPer1M(
      settings.pricing.inputPer1M != null ? String(settings.pricing.inputPer1M) : '',
    );
    setOutputPer1M(
      settings.pricing.outputPer1M != null ? String(settings.pricing.outputPer1M) : '',
    );
    setCurrency(settings.pricing.currency ?? 'USD');
  }, [settings]);

  const refreshModels = async () => {
    setRefreshing(true);
    const result = await invokeAiAdmin<ModelsResponse>('list_models', { refresh: true });
    setRefreshing(false);
    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Gagal memuat daftar model', 'err');
      return;
    }
    setModels(result.data.models);
    setFetchedAt(result.data.fetchedAt ?? new Date().toISOString());
    showToast(`${result.data.models.length} model berhasil dimuat`);
  };

  const testModel = async (key: string, model: string) => {
    const target = model.trim() || defaultModel.trim();
    if (!target) {
      showToast('Isi model ID terlebih dahulu', 'err');
      return;
    }
    setTesting(key);
    setTestResult(null);
    const result = await invokeAiAdmin<TestModelResponse>('test_model', { model: target });
    setTesting(null);
    if (!result.ok || !result.data) {
      setTestResult({ key, ok: false, message: result.error ?? 'Tes model gagal' });
      return;
    }
    setTestResult({
      key,
      ok: true,
      message: `${result.data.message} Balasan: "${result.data.reply}" (${result.data.latencyMs} ms)`,
    });
  };

  const save = async () => {
    if (!defaultModel.trim()) {
      showToast('Model default wajib diisi', 'err');
      return;
    }
    setSaving(true);
    const pricing: AiPricing = { currency: currency.trim() || 'USD' };
    if (inputPer1M.trim() !== '') pricing.inputPer1M = Number(inputPer1M);
    if (outputPer1M.trim() !== '') pricing.outputPer1M = Number(outputPer1M);
    const result = await invokeAiAdmin<AiSettingsPayload>('save_models', {
      defaultModel: defaultModel.trim(),
      featureModels,
      pricing,
    });
    setSaving(false);
    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Gagal menyimpan model', 'err');
      return;
    }
    onUpdate(result.data);
    showToast('Pengaturan model berhasil disimpan');
  };

  const datalist = (
    <datalist id="mimo-model-list">
      {models.map((model) => (
        <option key={model.id} value={model.id} />
      ))}
    </datalist>
  );

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card flat">
        <div className="row sp wrap">
          <div>
            <h2>Model Management</h2>
            <p className="sm muted mt1">
              Daftar model diambil langsung dari endpoint <code>/v1/models</code> Xiaomi MiMo.
            </p>
          </div>
          <button className="btn" onClick={() => void refreshModels()} disabled={refreshing}>
            <Icon name="refresh-cw" />
            {refreshing ? 'Memuat…' : 'Refresh Model List'}
          </button>
        </div>
        {fetchedAt ? (
          <p className="xs muted mt1">
            {models.length} model tersedia · dimuat {new Date(fetchedAt).toLocaleString('id-ID')}
          </p>
        ) : (
          <p className="xs muted mt1">
            Klik Refresh Model List setelah API Key disimpan untuk memuat pilihan model resmi.
          </p>
        )}
        {models.length ? (
          <div className="chips mt1">
            {models.map((model) => (
              <button
                type="button"
                className={`chip${defaultModel === model.id ? ' on' : ''}`}
                key={model.id}
                onClick={() => setDefaultModel(model.id)}
                title={`Gunakan ${model.id} sebagai model default`}
              >
                {model.id}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2>Model Default Global</h2>
        <p className="sm muted mt1">
          Digunakan bila model khusus fitur belum ditentukan. ID model juga bisa diketik manual.
        </p>
        {datalist}
        <div className="ai-form-grid mt">
          <div className="full">
            <label className="flab" htmlFor="ai-default-model">
              Model default
            </label>
            <div className="ai-key-row" style={{ flexWrap: 'nowrap' }}>
              <input
                id="ai-default-model"
                className="inp"
                list="mimo-model-list"
                value={defaultModel}
                onChange={(event) => setDefaultModel(event.target.value)}
                placeholder="mis. mimo-v2.6"
                spellCheck={false}
              />
              <button
                className="btn sm"
                onClick={() => void testModel('default', defaultModel)}
                disabled={testing !== null}
              >
                <Icon name="play" />
                {testing === 'default' ? 'Menguji…' : 'Tes Model'}
              </button>
            </div>
            {testResult?.key === 'default' ? (
              <div className={`xs mt1 ${testResult.ok ? 'muted' : ''}`}
                style={testResult.ok ? undefined : { color: 'var(--red)' }}>
                {testResult.message}
              </div>
            ) : null}
          </div>
        </div>

        <h2 className="mt2">Model per Fitur</h2>
        <p className="sm muted mt1">
          Setiap fitur dapat memakai model berbeda. Kosongkan untuk mengikuti model default global.
        </p>
        <div className="grid mt" style={{ gap: 12 }}>
          {FEATURES.map((feature) => (
            <div key={feature}>
              <label className="flab" htmlFor={`ai-model-${feature}`}>
                {FEATURE_MODEL_LABELS[feature]}
              </label>
              <div className="ai-key-row" style={{ flexWrap: 'nowrap' }}>
                <input
                  id={`ai-model-${feature}`}
                  className="inp"
                  list="mimo-model-list"
                  value={featureModels[feature] ?? ''}
                  onChange={(event) =>
                    setFeatureModels((previous) => ({
                      ...previous,
                      [feature]: event.target.value,
                    }))
                  }
                  placeholder={`Ikuti default (${defaultModel || '-'})`}
                  spellCheck={false}
                />
                <button
                  className="btn sm"
                  onClick={() => void testModel(feature, featureModels[feature] ?? '')}
                  disabled={testing !== null}
                >
                  <Icon name="play" />
                  {testing === feature ? 'Menguji…' : 'Tes'}
                </button>
              </div>
              {testResult?.key === feature ? (
                <div className={`xs mt1 ${testResult.ok ? 'muted' : ''}`}
                  style={testResult.ok ? undefined : { color: 'var(--red)' }}>
                  {testResult.message}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Estimasi Biaya (opsional)</h2>
        <p className="sm muted mt1">
          Isi harga token bila ingin Usage &amp; Logs menampilkan estimasi biaya. Biarkan kosong bila
          belum ada data harga resmi.
        </p>
        <div className="ai-form-grid mt">
          <div>
            <label className="flab" htmlFor="ai-price-input">
              Harga input / 1 juta token
            </label>
            <input
              id="ai-price-input"
              className="inp"
              type="number"
              min="0"
              step="0.001"
              value={inputPer1M}
              onChange={(event) => setInputPer1M(event.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="flab" htmlFor="ai-price-output">
              Harga output / 1 juta token
            </label>
            <input
              id="ai-price-output"
              className="inp"
              type="number"
              min="0"
              step="0.001"
              value={outputPer1M}
              onChange={(event) => setOutputPer1M(event.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="flab" htmlFor="ai-price-currency">
              Mata uang
            </label>
            <input
              id="ai-price-currency"
              className="inp"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              placeholder="USD"
              maxLength={8}
            />
          </div>
        </div>
      </div>

      <div className="row wrap">
        <button className="btn p" onClick={() => void save()} disabled={saving}>
          <Icon name="save" />
          {saving ? 'Menyimpan…' : 'Simpan Model'}
        </button>
      </div>

      {!settings.hasApiKey ? (
        <Note variant="warn" icon="shield-alert">
          API Key belum tersimpan. Refresh daftar model dan Tes Model memerlukan API Key pada tab
          Provider.
        </Note>
      ) : null}
    </div>
  );
}
