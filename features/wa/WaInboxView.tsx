'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  loadConversations,
  loadMessages,
  releaseConversation,
  sendReply,
  takeOver,
  type WaConversation,
  type WaMessage,
  type WaStats,
} from './wa-api';

function waktu(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
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

export function WaInboxView() {
  const [items, setItems] = useState<WaConversation[]>([]);
  const [stats, setStats] = useState<WaStats | null>(null);
  const [selected, setSelected] = useState('');
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [search, setSearch] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [handoverBusy, setHandoverBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

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

  const openThread = useCallback(async (sender: string) => {
    if (!sender) return;
    setLoadingThread(true);
    const res = await loadMessages(sender);
    setLoadingThread(false);
    if (!res.ok) {
      setError(res.error || 'Gagal memuat pesan.');
      return;
    }
    setError('');
    setMessages(res.data?.items || []);
  }, []);

  useEffect(() => {
    void refreshList();
    const timer = setInterval(() => void refreshList(), 30_000);
    return () => clearInterval(timer);
  }, [refreshList]);

  useEffect(() => {
    if (selected) void openThread(selected);
    else setMessages([]);
  }, [selected, openThread]);

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
      <PageHeader
        eyebrow="CRM"
        title="WA Inbox"
        subtitle="Percakapan WhatsApp customer: lihat riwayat, balas manual, dan pantau yang belum dibalas."
        actions={
          <button className="btn ghost sm" type="button" onClick={() => void refreshList()}>
            <Icon name="refresh-cw" size={15} />
            Muat ulang
          </button>
        }
      />

      {error ? (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 12, color: 'var(--rd, #b42318)' }}>
          {error}
        </div>
      ) : null}

      <div className="wa-grid">
        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 520 }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line, #e5e7eb)' }}>
            <div className="row sp" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Percakapan</h3>
              <span className="tag gr">{items.length}</span>
            </div>
            <input
              className="inp"
              placeholder="Cari nama / nomor / isi pesan"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="chips" style={{ marginTop: 8 }}>
              <button
                type="button"
                className={`chip${onlyPending ? '' : ' on'}`}
                onClick={() => setOnlyPending(false)}
              >
                Semua
              </button>
              <button
                type="button"
                className={`chip${onlyPending ? ' on' : ''}`}
                onClick={() => setOnlyPending(true)}
              >
                Belum dibalas {stats?.pending ? `(${stats.pending})` : ''}
              </button>
            </div>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div className="empty">Memuat percakapan…</div>
            ) : filtered.length === 0 ? (
              <div className="empty">Tidak ada percakapan pada filter ini.</div>
            ) : (
              filtered.map((item) => {
                const active = item.sender === selected;
                return (
                  <button
                    key={item.sender}
                    type="button"
                    onClick={() => setSelected(item.sender)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 14px',
                      border: 0,
                      borderBottom: '1px solid var(--line, #eee)',
                      background: active ? 'var(--bg2, #f5f5f5)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div className="row sp" style={{ gap: 8 }}>
                      <b style={{ fontSize: 13.5 }}>{item.name || rapikanNomor(item.sender)}</b>
                      <span className="xs muted">{waktu(item.lastAt)}</span>
                    </div>
                    <div className="xs muted" style={{ marginTop: 2 }}>
                      {rapikanNomor(item.sender)}
                    </div>
                    <div
                      className="xs"
                      style={{
                        marginTop: 4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.lastMessage}
                    </div>
                    {item.pending > 0 ? (
                      <span className="tag yl" style={{ marginTop: 6, display: 'inline-flex' }}>
                        {item.pending} belum dibalas
                      </span>
                    ) : null}
                    {item.handover ? (
                      <span className="tag gr" style={{ marginTop: 6, marginLeft: 6, display: 'inline-flex' }}>
                        diambil alih admin
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 520 }}>
          {!current ? (
            <div className="empty" style={{ margin: 'auto' }}>
              Pilih percakapan di kiri.
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--line, #e5e7eb)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{ flex: 1 }}>
                  <b>{current.name || rapikanNomor(current.sender)}</b>
                  <div className="xs muted">{rapikanNomor(current.sender)}</div>
                </div>
                {current.pending > 0 ? <span className="tag yl">{current.pending} belum dibalas</span> : null}
                {current.handover ? <span className="tag gr">diambil alih admin</span> : null}
                <button
                  className={`btn ${current.handover ? '' : 'p'} sm`}
                  type="button"
                  onClick={() => void onToggleHandover()}
                  disabled={handoverBusy}
                >
                  {current.handover ? 'Kembalikan ke bot' : 'Ambil alih'}
                </button>
                <button
                  className="btn ghost sm"
                  type="button"
                  onClick={() => void openThread(current.sender)}
                  title="Muat ulang percakapan"
                >
                  <Icon name="refresh-cw" size={14} />
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {loadingThread ? (
                  <div className="empty">Memuat pesan…</div>
                ) : messages.length === 0 ? (
                  <div className="empty">Belum ada pesan.</div>
                ) : (
                  messages.map((row) => (
                    <div key={row.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {row.message ? (
                        <div
                          style={{
                            alignSelf: 'flex-start',
                            maxWidth: '82%',
                            background: 'var(--bg2, #f2f3f5)',
                            padding: '8px 12px',
                            borderRadius: 12,
                          }}
                        >
                          <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{row.message}</div>
                          <div className="xs muted" style={{ marginTop: 4 }}>
                            {waktu(row.created_at)}
                          </div>
                        </div>
                      ) : null}

                      {row.reply_text ? (
                        <div
                          style={{
                            alignSelf: 'flex-end',
                            maxWidth: '82%',
                            background: '#111',
                            color: '#fff',
                            padding: '8px 12px',
                            borderRadius: 12,
                          }}
                        >
                          <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{row.reply_text}</div>
                          <div className="xs" style={{ marginTop: 4, opacity: 0.7 }}>
                            {waktu(row.replied_at)}
                            {row.error === 'dibalas manual' ? ' · manual' : ''}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
                <div ref={endRef} />
              </div>

              <div style={{ padding: 12, borderTop: '1px solid var(--line, #e5e7eb)' }}>
                <textarea
                  className="inp"
                  rows={2}
                  placeholder="Tulis balasan…"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  style={{ width: '100%', resize: 'vertical' }}
                />
                <div className="row sp" style={{ marginTop: 8 }}>
                  <span className="xs muted">Terkirim lewat device CS SAMAQU.</span>
                  <button
                    className="btn p sm"
                    type="button"
                    onClick={() => void onSend()}
                    disabled={sending || !draft.trim()}
                  >
                    {sending ? 'Mengirim…' : 'Kirim'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
