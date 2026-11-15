'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadRuns, type WaRun } from './wa-api';
import {
  applyFilter,
  countKinds,
  parseRun,
  summarize,
  type LogFilter,
  type ParsedRun,
  type ParsedSteps,
} from './log-parse';
import { buildTimeline, nomorRapi } from './log-timeline';

/**
 * Tab "Log Bot" di WA Inbox.
 *
 * Satu kartu per AKTIVITAS bot (balas customer, gagal, jaring pengaman), bukan satu baris per
 * pengecekan cron. Run kosong (±70% isi tabel) disembunyikan di server; jumlahnya tetap ditampilkan.
 * Rincian teknis (ronde AI, tool, hasil) dilipat di "Lihat langkah AI".
 */

const POLL_MS = 30_000;

function jam(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const now = new Date();
  const sameDay =
    d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }) === now.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
  const time = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' })
    .format(d)
    .replace(':', '.');
  if (sameDay) return time;
  const date = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', timeZone: 'Asia/Jakarta' }).format(d);
  return `${date}, ${time}`;
}

const TONE_MARK: Record<string, string> = { ok: '✓', bad: '✕', warn: '!', info: '•', muted: '•' };

function StepsView({ steps, raw }: { steps: ParsedSteps | null; raw: string }) {
  const timeline = useMemo(() => (steps ? buildTimeline(steps) : []), [steps]);
  if (!steps) {
    return (
      <div className="wl-steps">
        <p className="wl-steps-note">Run ini dicatat sebelum jejak langkah tersedia. Catatan mentahnya:</p>
        <pre className="wl-raw">{raw}</pre>
      </div>
    );
  }
  return (
    <div className="wl-steps">
      {timeline.length ? (
        <ol className="wl-timeline">
          {timeline.map((step, index) => (
            <li className={`wl-step tone-${step.tone}`} key={index}>
              <span className="wl-step-mark" aria-hidden="true">
                {TONE_MARK[step.tone] || '•'}
              </span>
              <div className="wl-step-body">
                <div className="wl-step-title">
                  {step.title}
                  {step.slow ? <em className="wl-step-slow">{step.slow}</em> : null}
                </div>
                {step.note ? <div className="wl-step-note">AI menulis: {step.note}</div> : null}
                {step.result ? <div className="wl-step-result">{step.result}</div> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      {steps.context ? (
        <details className="wl-ctx">
          <summary>Yang dilihat AI (pesan masuk dan riwayat)</summary>
          <pre className="wl-raw">{steps.context}</pre>
        </details>
      ) : null}
      <details className="wl-ctx wl-tech">
        <summary>Detail teknis (ronde, token, milidetik)</summary>
        <p className="wl-steps-note">
          Model AI dijalankan tanpa mode berpikir (lebih cepat dan murah), jadi yang tercatat adalah teks model, tool yang dipanggil, dan hasilnya.
        </p>
        {steps.rounds.map((round, index) => (
          <div className="wl-round" key={index}>
            <div className="wl-round-title">{round.title}</div>
            {round.text ? <div className="wl-round-text">{round.text}</div> : null}
            {round.tools.map((tool, toolIndex) => (
              <div className="wl-tool" key={toolIndex}>
                <div className="wl-tool-call">{tool.call}</div>
                {tool.result ? <div className="wl-tool-result">{tool.result}</div> : null}
              </div>
            ))}
          </div>
        ))}
      </details>
    </div>
  );
}

function RunCard({ item, open, onToggle }: { item: ParsedRun; open: boolean; onToggle: () => void }) {
  const who = [item.customerName, item.customerPhone ? nomorRapi(item.customerPhone) : ''].filter(Boolean).join(' · ');
  const hasDetail = Boolean(item.run.detail) || Boolean(item.run.error);
  return (
    <article className={`wl-card tone-${item.tone}`} data-kind={item.kind}>
      <header className="wl-head">
        <b className="wl-time">{jam(item.run.created_at)}</b>
        <span className={`wl-chip tone-${item.tone}`}>{item.label}</span>
        {who ? <span className="wl-who">{who}</span> : null}
        {item.seconds ? <span className="wl-dur">{item.seconds}</span> : null}
      </header>

      <p className="wl-headline">{item.headline}</p>

      {item.customerText ? (
        <div className="wl-bubble cust">
          <span>Customer</span>
          {item.customerText}
        </div>
      ) : null}
      {item.botText ? (
        <div className="wl-bubble bot">
          <span>Agent</span>
          {item.botText}
        </div>
      ) : null}

      {item.tools.length ? (
        <div className="wl-tools">
          {item.tools.map((tool, index) => (
            <span className="wl-tool-chip" key={`${tool}-${index}`}>
              {tool}
            </span>
          ))}
        </div>
      ) : null}

      {hasDetail ? (
        <button type="button" className="wl-toggle" aria-expanded={open} onClick={onToggle}>
          {open ? 'Sembunyikan langkah AI' : item.kind === 'gagal' ? 'Lihat detail teknis' : 'Lihat langkah AI'}
        </button>
      ) : null}
      {open ? (
        <>
          {item.run.error ? <p className="wl-rawerr">Pesan teknis: {item.run.error}</p> : null}
          {item.run.detail ? <StepsView steps={item.steps} raw={item.run.detail} /> : null}
        </>
      ) : null}
    </article>
  );
}

export function LogBotView() {
  const [runs, setRuns] = useState<WaRun[]>([]);
  const [idle, setIdle] = useState<{ count: number; since: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<LogFilter>('perlu');
  const [showEmpty, setShowEmpty] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      // Run kosong disembunyikan di server (compact) kecuali diminta ditampilkan.
      const res = await loadRuns(showEmpty ? 200 : 80, !showEmpty);
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setError('');
        setRuns(res.data?.items || []);
        setIdle(res.data?.idle || null);
      } else {
        setError(res.error || 'Gagal memuat log agent.');
      }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [showEmpty]);

  const parsed = useMemo(() => runs.map(parseRun), [runs]);
  const summary = useMemo(() => summarize(parsed), [parsed]);
  const counts = useMemo(() => countKinds(parsed, showEmpty), [parsed, showEmpty]);
  const visible = useMemo(() => applyFilter(parsed, filter, showEmpty), [parsed, filter, showEmpty]);

  const toggle = (id: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filters: Array<{ key: LogFilter; label: string; count: number }> = [
    { key: 'perlu', label: 'Perlu perhatian', count: counts.perlu },
    { key: 'semua', label: 'Semua aktivitas', count: counts.semua },
    { key: 'gagal', label: 'Gagal', count: counts.gagal },
    { key: 'jaring', label: 'Jaring pengaman', count: counts.jaring },
  ];

  return (
    <div className="wl" data-testid="log-bot">
      <div className="wl-metrics">
        <div className="wl-metric">
          <small>Pesan dibalas hari ini</small>
          <b>{summary.replied}</b>
        </div>
        <div className="wl-metric">
          <small>Run gagal</small>
          <b className={summary.failed ? 'bad' : ''}>{summary.failed}</b>
        </div>
        <div className="wl-metric">
          <small>Kasus jaring pengaman</small>
          <b className={summary.safety ? 'warn' : ''}>{summary.safety}</b>
        </div>
        <div className="wl-metric">
          <small>Rata-rata waktu jawab</small>
          <b>{summary.avgSeconds}</b>
        </div>
      </div>

      <div className="wl-filters">
        {filters.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={`wl-pill${filter === entry.key ? ' on' : ''}`}
            aria-pressed={filter === entry.key}
            onClick={() => setFilter(entry.key)}
          >
            {entry.label} <em>{entry.count}</em>
          </button>
        ))}
        <label className="wl-empty-toggle">
          <input type="checkbox" checked={showEmpty} onChange={(event) => setShowEmpty(event.target.checked)} />
          Tampilkan run kosong
        </label>
      </div>

      {!showEmpty && idle && idle.count > 0 ? (
        <div className="wl-idle" data-testid="log-idle">
          {idle.count} pengecekan kosong (tidak ada pesan baru) disembunyikan sejak {idle.since ? jam(idle.since) : 'awal'}
        </div>
      ) : null}

      {error ? <div className="wa-error-inline" role="alert">{error}</div> : null}

      {loading && runs.length === 0 ? (
        <div className="empty">Memuat log…</div>
      ) : visible.length === 0 ? (
        <div className="empty">
          {filter === 'perlu' ? 'Tidak ada yang perlu perhatian. Agent berjalan normal.' : 'Tidak ada aktivitas untuk filter ini.'}
        </div>
      ) : (
        <div className="wl-list">
          {visible.map((item) => (
            <RunCard key={item.run.id} item={item} open={open.has(item.run.id)} onToggle={() => toggle(item.run.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
