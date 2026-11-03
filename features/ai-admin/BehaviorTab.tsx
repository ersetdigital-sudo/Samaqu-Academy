'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/Note';
import type {
  AiBehavior,
  AiSettings,
  AiSettingsPayload,
  ResponseLength,
} from '@/lib/ai/admin';
import { invokeAiAdmin } from '@/lib/ai/remote';

interface BehaviorTabProps {
  settings: AiSettings;
  defaults: AiBehavior;
  onUpdate: (payload: AiSettingsPayload) => void;
}

interface PreviewResponse {
  prompt: string;
  answer: string | null;
  model?: string;
  message?: string;
}

function formOf(behavior: AiBehavior): AiBehavior {
  return { ...behavior };
}

export function BehaviorTab({ settings, defaults, onUpdate }: BehaviorTabProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<AiBehavior>(formOf(settings.behavior));
  const [previewQuestion, setPreviewQuestion] = useState('');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    setForm(formOf(settings.behavior));
  }, [settings]);

  const patch = <K extends keyof AiBehavior>(key: K, value: AiBehavior[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    const result = await invokeAiAdmin<AiSettingsPayload>('save_behavior', { behavior: form });
    setSaving(false);
    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Gagal menyimpan perilaku AI', 'err');
      return;
    }
    onUpdate(result.data);
    showToast('Perilaku AI berhasil disimpan');
  };

  const reset = () => {
    setForm(formOf(defaults));
    setPreview(null);
    showToast('Form dikembalikan ke pengaturan default. Klik Simpan untuk menerapkan.');
  };

  const runPreview = async () => {
    setPreviewing(true);
    setPreview(null);
    const result = await invokeAiAdmin<PreviewResponse>('preview_behavior', {
      behavior: form,
      question: previewQuestion.trim(),
    });
    setPreviewing(false);
    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Preview gagal', 'err');
      return;
    }
    setPreview(result.data);
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card flat">
        <div className="row sp wrap">
          <div>
            <h2>AI Behavior Configuration</h2>
            <p className="sm muted mt1">
              System prompt utama dikelola terpusat di server dan berlaku untuk seluruh fitur AI.
            </p>
          </div>
          <span className="tag gr">Terkelola terpusat</span>
        </div>
      </div>

      <div className="card">
        <div className="ai-form-grid">
          <div>
            <label className="flab" htmlFor="ai-assistant-name">
              Nama asisten
            </label>
            <input
              id="ai-assistant-name"
              className="inp"
              value={form.assistantName}
              onChange={(event) => patch('assistantName', event.target.value)}
            />
          </div>
          <div>
            <label className="flab" htmlFor="ai-language">
              Bahasa respons
            </label>
            <select
              id="ai-language"
              className="inp"
              value={form.language}
              onChange={(event) => patch('language', event.target.value)}
            >
              <option value="id">Bahasa Indonesia</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="full">
            <label className="flab" htmlFor="ai-character">
              Karakter komunikasi
            </label>
            <input
              id="ai-character"
              className="inp"
              value={form.character}
              onChange={(event) => patch('character', event.target.value)}
            />
          </div>
          <div className="full">
            <label className="flab" htmlFor="ai-system">
              System instructions
            </label>
            <textarea
              id="ai-system"
              className="inp"
              rows={12}
              value={form.systemInstructions}
              onChange={(event) => patch('systemInstructions', event.target.value)}
            />
            <p className="xs muted mt1">
              Instruksi ini menjadi dasar perilaku AI. Aturan knowledge dan memory ditambahkan
              otomatis oleh server.
            </p>
          </div>
          <div>
            <label className="flab" htmlFor="ai-length">
              Panjang respons
            </label>
            <select
              id="ai-length"
              className="inp"
              value={form.responseLength}
              onChange={(event) => patch('responseLength', event.target.value as ResponseLength)}
            >
              <option value="pendek">Pendek</option>
              <option value="sedang">Sedang</option>
              <option value="panjang">Panjang</option>
            </select>
          </div>
          <div>
            <label className="flab" htmlFor="ai-max-tokens">
              Batas token respons
            </label>
            <input
              id="ai-max-tokens"
              className="inp"
              type="number"
              min={100}
              max={4000}
              step={50}
              value={form.maxTokens}
              onChange={(event) => patch('maxTokens', Number(event.target.value))}
            />
          </div>
          <div className="full">
            <label className="flab" htmlFor="ai-temperature">
              Temperature: {form.temperature.toFixed(2)}
            </label>
            <input
              id="ai-temperature"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={form.temperature}
              onChange={(event) => patch('temperature', Number(event.target.value))}
              style={{ width: '100%' }}
            />
            <p className="xs muted mt1">
              Nilai rendah lebih konsisten dan faktual; nilai tinggi lebih variatif.
            </p>
          </div>
          <div className="full">
            <label className="flab" htmlFor="ai-knowledge-rules">
              Aturan penggunaan knowledge
            </label>
            <textarea
              id="ai-knowledge-rules"
              className="inp"
              rows={3}
              value={form.knowledgeRules}
              onChange={(event) => patch('knowledgeRules', event.target.value)}
            />
          </div>
          <div className="full">
            <label className="flab" htmlFor="ai-memory-rules">
              Aturan penggunaan memory
            </label>
            <textarea
              id="ai-memory-rules"
              className="inp"
              rows={3}
              value={form.memoryRules}
              onChange={(event) => patch('memoryRules', event.target.value)}
            />
          </div>
        </div>

        <div className="row wrap mt2">
          <button className="btn p" onClick={() => void save()} disabled={saving}>
            <Icon name="save" />
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
          <button className="btn" onClick={reset}>
            <Icon name="rotate-ccw" />
            Kembalikan ke Default
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Preview Perilaku AI</h2>
        <p className="sm muted mt1">
          Kirim satu pertanyaan percobaan memakai konfigurasi di atas. Permintaan ini memakai token
          dan tercatat di Usage &amp; Logs.
        </p>
        <div className="ai-key-row mt" style={{ flexWrap: 'nowrap' }}>
          <input
            className="inp"
            value={previewQuestion}
            onChange={(event) => setPreviewQuestion(event.target.value)}
            placeholder="Contoh: Perkenalkan dirimu dan cara membantu admin Samaqu."
          />
          <button className="btn" onClick={() => void runPreview()} disabled={previewing}>
            <Icon name="play" />
            {previewing ? 'Memproses…' : 'Preview'}
          </button>
        </div>

        {preview ? (
          <div className="mt">
            {preview.answer ? (
              <>
                <div className="after sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {preview.answer}
                </div>
                <div className="xs muted mt1">
                  Model: {preview.model ?? '-'} · jawaban preview tidak disimpan sebagai memory.
                </div>
              </>
            ) : (
              <Note variant="warn" icon="shield-alert">
                {preview.message ?? 'Preview instruksi ditampilkan tanpa memanggil model.'}
              </Note>
            )}
            <details className="mt1">
              <summary className="sm" style={{ cursor: 'pointer' }}>
                Lihat system prompt lengkap
              </summary>
              <pre
                className="sm mt1"
                style={{
                  whiteSpace: 'pre-wrap',
                  background: 'var(--gl2)',
                  border: '1px solid var(--b)',
                  borderRadius: 9,
                  padding: 12,
                  maxHeight: 320,
                  overflow: 'auto',
                }}
              >
                {preview.prompt}
              </pre>
            </details>
          </div>
        ) : null}
      </div>
    </div>
  );
}
