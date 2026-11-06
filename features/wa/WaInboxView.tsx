'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
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
    <div className={`wa-shell${selected ? ' on-chat' : ''}`}>
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
                onClick={() => setSelected(item.sender)}
              >
                <div className="wa-av">{inisial(item.name, item.sender)}</div>
                <div className="wa-item-body">
                  <div className="wa-item-top">
                    <b>{item.name || rapikanNomor(item.sender)}</b>
                    <span>{waktu(item.lastAt)}</span>
                  </div>
                  <div className="wa-item-bottom">
                    <span className="wa-preview">{item.lastMessage || '—'}</span>
                    {item.pending > 0 ? <span className="wa-badge">{item.pending}</span> : null}
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
              {current.handover ? <span className="wa-flag chat">diambil alih admin</span> : null}
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
                          {row.status === 'skipped' ? ' · dilewati' : ''}
                        </div>
                      </div>
                    ) : null}

                    {row.reply_text ? (
                      <div className="wa-bubble out">
                        <div className="wa-text">{row.reply_text}</div>
                        <div className="wa-time">
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

      {error ? (
        <div className="wa-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
