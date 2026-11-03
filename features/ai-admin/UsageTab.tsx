'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/Note';
import {
  AI_FEATURE_LABELS,
  type AiSettings,
  type AiUsageLog,
} from '@/lib/ai/admin';
import { invokeAiAdmin } from '@/lib/ai/remote';
import { formatDateTime } from '@/lib/utils/format';

interface UsageTabProps {
  settings: AiSettings;
}

interface UsageResponse {
  logs: AiUsageLog[];
}

const FEATURES: Array<AiUsageLog['feature'] | ''> = [
  '',
  'assistant',
  'reviewer',
  'simulator',
  'admin_test',
  'admin_models',
];

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} jt`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} rb`;
  return String(value);
}

export function UsageTab({ settings }: UsageTabProps) {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<AiUsageLog[]>([]);
  const [feature, setFeature] = useState<AiUsageLog['feature'] | ''>('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await invokeAiAdmin<UsageResponse>('get_usage', {
      limit: 100,
      feature: feature || undefined,
    });
    setLoading(false);
    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Gagal memuat log penggunaan', 'err');
      return;
    }
    setLogs(result.data.logs);
  }, [feature, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalTokens = logs.reduce((sum, log) => sum + (log.total_tokens ?? 0), 0);
  const success = logs.filter((log) => log.status === 'success').length;
  const estimated = logs.reduce((sum, log) => sum + (log.estimated_cost ?? 0), 0);
  const currency = settings.pricing.currency ?? 'USD';

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card flat">
        <div className="row sp wrap">
          <div>
            <h2>Usage &amp; Logs</h2>
            <p className="sm muted mt1">
              Catatan 100 permintaan terakhir. API Key dan isi percakapan tidak ditampilkan di log.
            </p>
          </div>
          <div className="row">
            <select
              className="inp auto"
              value={feature}
              onChange={(event) =>
                setFeature(event.target.value as AiUsageLog['feature'] | '')
              }
              aria-label="Filter fitur AI"
            >
              {FEATURES.map((value) => (
                <option key={value || 'all'} value={value}>
                  {value ? AI_FEATURE_LABELS[value] : 'Semua fitur'}
                </option>
              ))}
            </select>
            <button className="btn" onClick={() => void load()} disabled={loading}>
              <Icon name="refresh-cw" />
              {loading ? 'Memuat…' : 'Muat Ulang'}
            </button>
          </div>
        </div>
      </div>

      <div className="ai-usage-summary">
        <div className="card soft">
          <div className="xs muted">Permintaan</div>
          <h2 className="mt1">{logs.length}</h2>
        </div>
        <div className="card soft">
          <div className="xs muted">Berhasil</div>
          <h2 className="mt1">
            {success}
            <span className="sm muted"> / {logs.length}</span>
          </h2>
        </div>
        <div className="card soft">
          <div className="xs muted">Total token</div>
          <h2 className="mt1">{formatTokens(totalTokens)}</h2>
          <div className="xs muted">
            {estimated > 0
              ? `Estimasi ${currency} ${estimated.toFixed(4)}`
              : settings.pricing.inputPer1M != null || settings.pricing.outputPer1M != null
                ? 'Belum ada biaya tercatat'
                : 'Harga token belum dikonfigurasi'}
          </div>
        </div>
      </div>

      <div className="card">
        {loading && !logs.length ? (
          <div className="ai-usage-empty">
            <div className="spinner" />
            Memuat log…
          </div>
        ) : logs.length ? (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Pengguna</th>
                  <th>Fitur</th>
                  <th>Model</th>
                  <th>Token</th>
                  <th>Status</th>
                  <th>Estimasi</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(log.created_at)}</td>
                    <td>{log.user_email ?? '-'}</td>
                    <td>{AI_FEATURE_LABELS[log.feature]}</td>
                    <td>
                      <span className="xs">{log.model ?? '-'}</span>
                    </td>
                    <td>
                      {log.total_tokens != null ? (
                        <span title={`Prompt ${log.prompt_tokens ?? 0} · Completion ${log.completion_tokens ?? 0}`}>
                          {log.total_tokens}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <span className={`tag ${log.status === 'success' ? 'gr' : 'rd'}`}>
                        {log.status === 'success' ? 'Sukses' : 'Gagal'}
                      </span>
                      {log.error ? (
                        <div className="xs muted" title={log.error} style={{ maxWidth: 190 }}>
                          {log.error.slice(0, 80)}
                          {log.error.length > 80 ? '…' : ''}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {log.estimated_cost != null && log.estimated_cost > 0
                        ? `${currency} ${log.estimated_cost.toFixed(4)}`
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ai-usage-empty">
            <Icon name="activity" size={24} />
            <p className="mt1">Belum ada penggunaan AI yang tercatat.</p>
          </div>
        )}
      </div>

      <Note variant="neutral" icon="shield-check">
        Log hanya menyimpan metadata permintaan (fitur, model, token, status). API Key dan isi pesan
        customer tidak ditulis ke log.
      </Note>
    </div>
  );
}
