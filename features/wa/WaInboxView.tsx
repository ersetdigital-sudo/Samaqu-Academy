'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppLink as Link } from '@/components/ui/AppLink';
import { Icon } from '@/components/ui/Icon';
import { useRole } from '@/components/providers/RoleProvider';
import {
  loadConversations,
  loadMessages,
  loadRuns,
  releaseConversation,
  sendReply,
  takeOver,
  type WaConversation,
  type WaMessage,
  type WaRun,
  type WaStats,
} from './wa-api';
import { useWaRealtime } from './useWaRealtime';

function waktu(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const now = new Date();
  const sameDay =
    d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }) ===
    now.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
  return new Intl.DateTimeFormat('id-ID', sameDay
    ? { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }
    : { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'Asia/Jakarta' }
  ).format(d);
}

function jam(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(d);
}

function rapikanNomor(sender: string): string {
  const digits = String(sender || '').replace(/\D/g, '');
  return digits.startsWith('62') ? `0${digits.slice(2)}` : digits;
}

function inisial(name: string, sender: string): string {
  const text = (name || rapikanNomor(sender) || '?').trim();
  const parts = text.split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export function WaInboxView() {
  const [items, setItems] = useState<WaConversation[]>([]);
  const [stats, setStats] = useState<WaStats | null>(null);
  const [selected, setSelected] = useState('');
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [search, setSearch] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [handoverBusy, setHandoverBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'chat' | 'log'>('chat');
  const [runs, setRuns] = useState<WaRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [shellHeight, setShellHeight] = useState(0);
  const { role } = useRole();

  const refreshList = useCallback(async () => {
    const res = await loadConversations();
    if (!res.ok) {
      setError(res.error || 'Gagal memuat percakapan.');
      setLoading(false);
      return;
    }
    setError('');
    setItems(res.data?.items || []);
    setStats(res.data?.stats || null);
    setLoading(false);
  }, []);

  const openThread = useCallback(async (sender: string, showLoading = true) => {
    if (!sender) return;
    if (showLoading) setLoadingThread(true);
    const res = await loadMessages(sender);
    if (showLoading) setLoadingThread(false);
    if (!res.ok) {
      setError(res.error || 'Gagal memuat pesan.');
      return;
    }
    setError('');
    setMessages(res.data?.items || []);
  }, []);

  const refreshAll = useCallback(async () => {
    await refreshList();
    if (selected) await openThread(selected, false);
  }, [refreshList, openThread, selected]);

  useEffect(() => {
    void refreshList();
    const timer = setInterval(() => void refreshList(), 60_000);
    const onFocus = () => void refreshList();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshList]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshAll]);

  useEffect(() => {
    if (selected) void openThread(selected);
    else setMessages([]);
  }, [selected, openThread]);

  useEffect(() => {
    if (!selected) return;
    const timer = setInterval(() => void openThread(selected), 60_000);
    return () => clearInterval(timer);
  }, [selected, openThread]);

  useWaRealtime({ onSignal: () => void refreshAll() });

  useEffect(() => {
    if (tab !== 'log') return;
    let cancelled = false;
    const load = async () => {
      setLoadingRuns(true);
      const res = await loadRuns();
      if (cancelled) return;
      setLoadingRuns(false);
      if (res.ok) setRuns(res.data?.items || []);
      else setError(res.error || 'Gagal memuat log bot.');
    };
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [tab]);

  // Tinggi panel dihitung dari posisi nyata di layar, supaya kolom balasan selalu kelihatan.
  useEffect(() => {
    if (tab !== 'chat') return;
    const calc = () => {
      const el = shellRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setShellHeight(Math.max(420, Math.floor(window.innerHeight - top - 16)));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, [tab]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (onlyPending && item.pending === 0) return false;
      if (!q) return true;
      return [item.name, item.sender, item.lastMessage]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [items, search, onlyPending]);

  const current = items.find((item) => item.sender === selected) || null;

  async function onSend() {
    const text = draft.trim();
    if (!text || !selected || sending) return;
    setSending(true);
    const res = await sendReply(selected, text);
    setSending(false);
    if (!res.ok) {
      setError(res.error || 'Gagal mengirim.');
      return;
    }
    setDraft('');
    setError('');
    await openThread(selected);
    await refreshList();
  }

  async function onToggleHandover() {
    if (!current || handoverBusy) return;
    setHandoverBusy(true);
    const res = current.handover
      ? await releaseConversation(current.sender)
      : await takeOver(current.sender);
    setHandoverBusy(false);
    if (!res.ok) {
      setError(res.error || 'Gagal mengubah status percakapan.');
      return;
    }
    setError('');
    await refreshList();
  }

  return (
    <>
      <div className="wa-tabs">
        <button type="button" className={`chip${tab === 'chat' ? ' on' : ''}`} onClick={() => setTab('chat')}>
          Chat
        </button>
        <button type="button" className={`chip${tab === 'log' ? ' on' : ''}`} onClick={() => setTab('log')}>
          Log Bot
        </button>
        <span className="xs muted" style={{ marginLeft: 'auto' }}>
          {stats ? `${stats.pending} belum dibalas · ${stats.sent} terkirim` : ''}
        </span>
        {role === 'owner' ? (
          <Link href="/settings/memory" className="btn ghost sm">
            Instruksi & Contoh AI
          </Link>
        ) : null}
      </div>

      {error ? (
        <div className="wa-error-inline" role="alert">
          {error}
        </div>
      ) : null}

      {tab === 'log' ? (
        <div className="wa-logs">
          {loadingRuns && runs.length === 0 ? (
            <div className="empty">Memuat log…</div>
          ) : runs.length === 0 ? (
            <div className="empty">Belum ada log run.</div>
          ) : (
            runs.map((run) => (
              <div key={run.id} className="wa-log">
                <div className="wa-log-top">
                  <b>{waktu(run.created_at)}</b>
                  <span className={`tag ${run.error ? 'rd' : run.mode === 'running' ? 'yl' : run.mode === 'live' ? 'gr' : 'yl'}`}>
                    {run.mode === 'running' ? 'berjalan' : run.mode}
                  </span>
                  <span className="xs muted">{run.duration_ms ?? 0} ms</span>
                </div>
                <div className="wa-log-line">
                  masuk {run.handled} · dibalas {run.replied} · sisa {run.leftover} · putaran {run.rounds}
                  {run.held ? ` · ditahan ${run.held}` : ''}
                </div>
                {run.tools?.length ? (
                  <div className="xs muted">tool: {run.tools.join(', ')}</div>
                ) : null}
                {run.error ? <div className="wa-log-err">{run.error}</div> : null}
                {run.note ? <div className="wa-log-note">{run.note}</div> : null}
                {run.detail ? <pre className="wa-log-detail">{run.detail}</pre> : null}
              </div>
            ))
          )}
        </div>
      ) : (
        <div
          ref={shellRef}
          className={`wa-shell${selected ? ' on-chat' : ''}`}
          style={shellHeight ? { height: `${shellHeight}px` } : undefined}
        >
      <aside className="wa-side">
        <div className="wa-side-head">
          <div className="wa-me">CS</div>
          <div className="wa-side-title">
            <b>WhatsApp CS</b>
            <small>SAMAQU</small>
          </div>
          <button className="wa-icb" type="button" title="Muat ulang" onClick={() => void refreshList()}>
            <Icon name="refresh-cw" size={16} />
          </button>
        </div>

        <div className="wa-search">
          <input
            className="inp"
            placeholder="Cari atau mulai chat"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="wa-filters">
          <button type="button" className={`chip${onlyPending ? '' : ' on'}`} onClick={() => setOnlyPending(false)}>
            Semua
          </button>
          <button type="button" className={`chip${onlyPending ? ' on' : ''}`} onClick={() => setOnlyPending(true)}>
            Belum dibalas{stats?.pending ? ` (${stats.pending})` : ''}
          </button>
        </div>

        <div className="wa-list">
          {loading ? (
            <div className="empty">Memuat percakapan…</div>
          ) : filtered.length === 0 ? (
            <div className="empty">Tidak ada percakapan.</div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.sender}
                type="button"
                className={`wa-item${item.sender === selected ? ' on' : ''}`}
                onClick={() => {
                  setSelected(item.sender);
                  setOpened((prev) => new Set(prev).add(item.sender));
                }}
              >
                <div className="wa-av">{inisial(item.name, item.sender)}</div>
                <div className="wa-item-body">
                  <div className="wa-item-top">
                    <b>{item.name || rapikanNomor(item.sender)}</b>
                    <span>{waktu(item.lastAt)}</span>
                  </div>
                  <div className="wa-item-bottom">
                    <span className="wa-preview">{item.lastMessage || '—'}</span>
                    {item.pending > 0 && !opened.has(item.sender) ? (
                      <span className="wa-badge">{item.pending}</span>
                    ) : null}
                  </div>
                  {item.handover ? <span className="wa-flag">diambil alih admin</span> : null}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="wa-chat">
        {!current ? (
          <div className="wa-empty">
            <div className="wa-empty-mark">
              <Icon name="message-square-text" size={38} />
            </div>
            <h2>WA Inbox SAMAQU</h2>
            <p>Pilih percakapan di kiri untuk melihat riwayat dan membalas.</p>
          </div>
        ) : (
          <>
            <header className="wa-chat-head">
              <button
                className="wa-icb wa-back"
                type="button"
                title="Kembali"
                onClick={() => setSelected('')}
              >
                <Icon name="arrow-left" size={18} />
              </button>
              <div className="wa-av">{inisial(current.name, current.sender)}</div>
              <div className="wa-chat-title">
                <b>{current.name || rapikanNomor(current.sender)}</b>
                <small>{rapikanNomor(current.sender)}</small>
              </div>
              {current.handover ? <span className="wa-flag wa-flag-head">diambil alih admin</span> : null}
              <button
                className={`btn ${current.handover ? '' : 'p'} sm`}
                type="button"
                onClick={() => void onToggleHandover()}
                disabled={handoverBusy}
              >
                {current.handover ? 'Kembalikan ke bot' : 'Ambil alih'}
              </button>
              <button
                className="wa-icb"
                type="button"
                title="Muat ulang percakapan"
                onClick={() => void openThread(current.sender)}
              >
                <Icon name="refresh-cw" size={16} />
              </button>
            </header>

            <div className="wa-thread">
              {loadingThread ? (
                <div className="empty">Memuat pesan…</div>
              ) : messages.length === 0 ? (
                <div className="empty">Belum ada pesan.</div>
              ) : (
                messages.map((row) => (
                  <div key={row.id} className="wa-row">
                    {row.message ? (
                      <div className="wa-bubble in">
                        <div className="wa-text">{row.message}</div>
                        <div className="wa-time">
                          {jam(row.created_at)}
                          {row.status === 'skipped'
                            ? ` · dilewati${row.error ? ` (${row.error})` : ''}`
                            : ''}
                        </div>
                      </div>
                    ) : null}

                    {row.reply_text ? (
                      <div className="wa-bubble out">
                        <div className="wa-text">{row.reply_text}</div>
                        <div className="wa-time">
                          <span className="wa-tick" title="Terkirim">✓✓</span>
                          {jam(row.replied_at)}
                          {row.error === 'dibalas manual' ? ' · manual' : ' · bot'}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
              <div ref={endRef} />
            </div>

            <footer className="wa-composer">
              <textarea
                className="wa-input"
                rows={1}
                placeholder="Ketik pesan"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void onSend();
                  }
                }}
              />
              <button
                className="wa-send"
                type="button"
                title="Kirim"
                onClick={() => void onSend()}
                disabled={sending || !draft.trim()}
              >
                <Icon name="arrow-right" size={18} />
              </button>
            </footer>
          </>
        )}
      </section>
        </div>
      )}
    </>
  );
}
