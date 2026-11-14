'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppLink as Link } from '@/components/ui/AppLink';
import { useRole } from '@/components/providers/RoleProvider';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/Note';
import { PageHeader } from '@/components/ui/PageHeader';
import type { AiSettingsPayload } from '@/lib/ai/admin';
import { invokeAiAdmin } from '@/lib/ai/remote';
import { BehaviorTab } from './BehaviorTab';
import { ModelsTab } from './ModelsTab';
import { ProfileModelsNotice, ProfilesPanel } from './ProfilesPanel';
import { ProviderTab } from './ProviderTab';
import { UsageTab } from './UsageTab';

type TabKey = 'provider' | 'models' | 'behavior' | 'usage';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'provider', label: 'Provider & API', icon: 'key' },
  { key: 'models', label: 'Model', icon: 'layers' },
  { key: 'behavior', label: 'Behavior', icon: 'sliders-horizontal' },
  { key: 'usage', label: 'Usage & Logs', icon: 'activity' },
];

export function AiSettingsView() {
  const { canManage, hydrated } = useRole();
  const [tab, setTab] = useState<TabKey>('provider');
  const [payload, setPayload] = useState<AiSettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await invokeAiAdmin<AiSettingsPayload>('get_settings');
    setLoading(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? 'Gagal memuat pengaturan AI.');
      return;
    }
    setPayload(result.data);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!canManage) {
      setLoading(false);
      return;
    }
    void load();
  }, [canManage, hydrated, load]);

  if (hydrated && !canManage) {
    return (
      <div className="card ai-denied">
        <div
          className="sic"
          style={{
            margin: '0 auto',
            width: 46,
            height: 46,
            background: 'var(--redl)',
            color: 'var(--red)',
          }}
        >
          <Icon name="lock" size={20} />
        </div>
        <h2 className="mt">Akses terbatas</h2>
        <p className="sm muted mt1">
          Pengaturan AI hanya dapat dibuka oleh Owner / Super Admin. Hubungi Owner bila
          konfigurasi AI perlu diubah.
        </p>
        <Link className="btn mt2" href="/">
          <Icon name="arrow-left" />
          Kembali ke Overview
        </Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Pengaturan AI"
        subtitle="Provider, API Key, model, perilaku, dan log penggunaan Samaqu AI Brain."
        actions={
          <>
            <Link className="btn" href="/settings/memory">
              <Icon name="brain" />
              Memory Organisasi
            </Link>
            <button className="btn" onClick={() => void load()} disabled={loading}>
              <Icon name="refresh-cw" />
              Muat Ulang
            </button>
          </>
        }
      />

      <div className="seg ai-tabs" role="tablist" aria-label="Pengaturan AI">
        {TABS.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={tab === item.key}
            className={tab === item.key ? 'on' : ''}
            onClick={() => setTab(item.key)}
          >
            <Icon name={item.icon} />
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="app-loading">
          <div>
            <div className="spinner" />
            Memuat pengaturan AI…
          </div>
        </div>
      ) : error ? (
        <>
          <Note variant="red" icon="shield-alert">
            {error}
          </Note>
          <button className="btn mt" onClick={() => void load()}>
            <Icon name="refresh-cw" />
            Coba lagi
          </button>
        </>
      ) : payload ? (
        <>
          {tab === 'provider' ? (
            payload.profilesReady ? (
              <ProfilesPanel payload={payload} onUpdate={setPayload} />
            ) : (
              <ProviderTab
                settings={payload.settings}
                encryptionReady={payload.encryptionReady}
                onUpdate={setPayload}
              />
            )
          ) : null}
          {tab === 'models' ? (
            payload.profilesReady ? (
              <ProfileModelsNotice payload={payload} onGoProvider={() => setTab('provider')} />
            ) : (
              <ModelsTab settings={payload.settings} onUpdate={setPayload} />
            )
          ) : null}
          {tab === 'behavior' ? (
            <BehaviorTab
              settings={payload.settings}
              defaults={payload.defaults}
              onUpdate={setPayload}
            />
          ) : null}
          {tab === 'usage' ? <UsageTab settings={payload.settings} /> : null}
        </>
      ) : null}
    </>
  );
}
