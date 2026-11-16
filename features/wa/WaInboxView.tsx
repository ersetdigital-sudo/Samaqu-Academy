'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppLink as Link } from '@/components/ui/AppLink';
import { Icon } from '@/components/ui/Icon';
import { useRole } from '@/components/providers/RoleProvider';
import {
  closeEscalation,
  loadConversations,
  loadEscalations,
  loadMessages,
  loadWaiting,
  releaseConversation,
  sendReply,
  takeOver,
  type WaConversation,
  type WaEscalation,
  type WaMessage,
  type WaStats,
  type WaWaitingCustomer,
} from './wa-api';
import { useWaRealtime } from './useWaRealtime';
import { LogBotView } from './LogBotView';
import { LessonsView } from './LessonsView';

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

/**
 * Digit nomor tanpa awalan 62/0, supaya "0821…", "62821…", dan "821…" dianggap sama.
 * Dipakai untuk pencarian: nomor tersimpan sebagai 62xxx sementara admin sering mengetik 08xxx.
 */
function digitNomor(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('62')) return digits.slice(2);
  if (digits.startsWith('0')) return digits.replace(/^0+/, '');
  return digits;
}

/**
 * Cocokkan satu percakapan dengan kata kunci pencarian.
 *
 * Nama dan isi pesan terakhir dicocokkan sebagai teks biasa. Untuk nomor, kedua sisi
 * dinormalkan lebih dulu — tanpa ini mengetik "0821…" tidak pernah menemukan "62821…".
 * Pencocokan nomor hanya berlaku kalau kata kuncinya minimal 4 digit, supaya mengetik
 * satu angka tidak memunculkan semua percakapan.
 */
function cocokCari(item: WaConversation, kataKunci: string): boolean {
  const query = String(kataKunci || '').trim().toLowerCase();
  if (!query) return true;

  const teks = [item.name, item.lastMessage]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  if (teks.some((value) => value.includes(query))) return true;

  const digitKueri = digitNomor(query);
  if (digitKueri.length >= 4) {
    const digitSender = digitNomor(item.sender);
    if (digitSender.includes(digitKueri)) return true;
    const digitNama = digitNomor(item.name || '');
    return digitNama.length >= 4 && digitNama.includes(digitKueri);
  }

  // Kata kunci pendek: tetap cocokkan nomor apa adanya (perilaku lama), supaya "+62…" utuh tetap ketemu.
  return String(item.sender || '').toLowerCase().includes(query);
}

function inisial(name: string, sender: string): string {
  const text = (name || rapikanNomor(sender) || '?').trim();
  const parts = text.split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

/** Lama customer menunggu jawaban: "5 mnt", "3 jam", "8 hr". */
function lamaMenunggu(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const menit = Math.floor(ms / 60000);
  if (menit < 60) return `${Math.max(menit, 1)} mnt`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam`;
  return `${Math.floor(jam / 24)} hr`;
}

/** Tiga hari atau lebih menunggu: ditandai merah. */
const TERLAMBAT_MS = 3 * 24 * 3600 * 1000;

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
  const [tab, setTab] = useState<'chat' | 'waiting' | 'log' | 'lessons'>('chat');
  const [waiting, setWaiting] = useState<WaWaitingCustomer[]>([]);
  const [onlyRepeat, setOnlyRepeat] = useState(false);
  // Customer yang dipilih dari daftar "Perlu Dijawab" tapi tidak ada di daftar Chat (mis. percakapan lama).
  const [selectedInfo, setSelectedInfo] = useState<{ sender: string; name: string } | null>(null);
  const [escalations, setEscalations] = useState<WaEscalation[]>([]);
  const [closingEsc, setClosingEsc] = useState('');
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

  // Pertanyaan AI yang menunggu untuk customer yang sedang dibuka. Gagal memuat tidak mengganggu percakapan.
  const selectedRef = useRef('');
  selectedRef.current = selected;
  const loadEsc = useCallback(async (sender: string) => {
    if (!sender) {
      setEscalations([]);
      return;
    }
    const res = await loadEscalations(sender);
    // Jawaban terlambat dari customer yang sudah ditinggalkan tidak boleh menimpa kotak customer yang sedang dibuka.
    if (selectedRef.current !== sender) return;
    setEscalations(res.ok ? res.data?.items || [] : []);
  }, []);

  // Daftar customer yang menunggu jawaban. Gagal memuat tidak mengganggu tab Chat: daftar lama dibiarkan.
  const loadWaitingList = useCallback(async () => {
    const res = await loadWaiting();
    if (res.ok) setWaiting(res.data?.items || []);
  }, []);

  const refreshAll = useCallback(async () => {
    await refreshList();
    await loadWaitingList();
    if (selected) {
      await openThread(selected, false);
      await loadEsc(selected);
    }
  }, [refreshList, loadWaitingList, openThread, loadEsc, selected]);

  useEffect(() => {
    void refreshList();
    void loadWaitingList();
    const timer = setInterval(() => {
      void refreshList();
      void loadWaitingList();
    }, 60_000);
    const onFocus = () => {
      void refreshList();
      void loadWaitingList();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshList, loadWaitingList]);

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
    setEscalations([]);
    void loadEsc(selected);
  }, [selected, openThread, loadEsc]);

  useEffect(() => {
    if (!selected) return;
    const timer = setInterval(() => void openThread(selected), 60_000);
    return () => clearInterval(timer);
  }, [selected, openThread]);

  useWaRealtime({ onSignal: () => void refreshAll() });

  // Tab Log Bot memuat datanya sendiri (lihat `LogBotView`).

  // Tinggi panel dihitung dari posisi nyata di layar, supaya kolom balasan selalu kelihatan.
  useEffect(() => {
    if (tab !== 'chat' && tab !== 'waiting') return;
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
    const q = search.trim();
    return items.filter((item) => {
      if (onlyPending && item.pending === 0) return false;
      return cocokCari(item, q);
    });
  }, [items, search, onlyPending]);

  // Daftar "Perlu Dijawab": cari/saring di sisi layar (nama atau nomor), nomor 08…/62… dianggap sama.
  const waitingRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digit = digitNomor(q);
    return waiting.filter((row) => {
      if (onlyRepeat && !row.repeated) return false;
      if (!q) return true;
      if (row.name.toLowerCase().includes(q) || row.latestReason.toLowerCase().includes(q)) return true;
      return digit.length >= 4 && digitNomor(row.sender).includes(digit);
    });
  }, [waiting, search, onlyRepeat]);

  // Percakapan yang sedang dibuka. Kalau tidak ada di daftar Chat (percakapan lama), pakai data dari daftar "Perlu Dijawab"
  // supaya customer tetap bisa dibuka dan dibalas.
  const current: WaConversation | null =
    items.find((item) => item.sender === selected) ||
    (selected && selectedInfo && selectedInfo.sender === selected
      ? { sender: selected, name: selectedInfo.name, lastMessage: '', lastAt: '', lastStatus: '', pending: 0, sent: 0, total: 0, handover: false }
      : null);

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
    await loadEsc(selected);
    await loadWaitingList();
  }

  async function onCloseEscalation(id: string) {
    if (!id || closingEsc) return;
    setClosingEsc(id);
    const res = await closeEscalation(id);
    setClosingEsc('');
    if (!res.ok) {
      setError(res.error || 'Gagal menandai selesai.');
      return;
    }
    setError('');
    await loadEsc(selected);
    await loadWaitingList();
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
        <button type="button" className={`chip${tab === 'chat' ? ' on' : ''}`} onClick={() => { setTab('chat'); setSearch(''); }}>
          Chat
        </button>
        <button type="button" className={`chip${tab === 'waiting' ? ' on' : ''}`} onClick={() => { setTab('waiting'); setSearch(''); }} data-testid="tab-perlu-dijawab">
          Perlu Dijawab
          {waiting.length > 0 ? <span className="wa-tab-count">{waiting.length}</span> : null}
        </button>
        <button type="button" className={`chip${tab === 'log' ? ' on' : ''}`} onClick={() => setTab('log')}>
          Log Bot
        </button>
        <button type="button" className={`chip${tab === 'lessons' ? ' on' : ''}`} onClick={() => setTab('lessons')}>
          Pelajaran AI
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
        <LogBotView />
      ) : tab === 'lessons' ? (
        <LessonsView isOwner={role === 'owner'} />
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
            <b>{tab === 'waiting' ? 'Perlu Dijawab' : 'WhatsApp CS'}</b>
            <small>{tab === 'waiting' ? `${waiting.length} customer menunggu jawaban` : 'SAMAQU'}</small>
          </div>
          <button
            className="wa-icb"
            type="button"
            title="Muat ulang"
            onClick={() => {
              void refreshList();
              void loadWaitingList();
            }}
          >
            <Icon name="refresh-cw" size={16} />
          </button>
        </div>

        <div className="wa-search">
          <input
            className="inp"
            placeholder={tab === 'waiting' ? 'Cari nama atau nomor' : 'Cari atau mulai chat'}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {tab === 'waiting' ? (
          <div className="wa-filters">
            <button type="button" className={`chip${onlyRepeat ? '' : ' on'}`} onClick={() => setOnlyRepeat(false)}>
              Semua{waiting.length ? ` (${waiting.length})` : ''}
            </button>
            <button type="button" className={`chip${onlyRepeat ? ' on' : ''}`} onClick={() => setOnlyRepeat(true)}>
              Berulang{waiting.some((row) => row.repeated) ? ` (${waiting.filter((row) => row.repeated).length})` : ''}
            </button>
          </div>
        ) : (
          <div className="wa-filters">
            <button type="button" className={`chip${onlyPending ? '' : ' on'}`} onClick={() => setOnlyPending(false)}>
              Semua
            </button>
            <button type="button" className={`chip${onlyPending ? ' on' : ''}`} onClick={() => setOnlyPending(true)}>
              Belum dibalas{stats?.pending ? ` (${stats.pending})` : ''}
            </button>
          </div>
        )}

        <div className="wa-list">
          {tab === 'waiting' ? (
            waitingRows.length === 0 ? (
              <div className="empty" data-testid="waiting-kosong">
                {waiting.length === 0 ? 'Semua pertanyaan sudah dijawab.' : 'Tidak ada customer yang cocok.'}
              </div>
            ) : (
              waitingRows.map((row) => {
                // Pakai format nomor dari daftar Chat bila ada (itu yang dipakai saat membalas); kalau tidak ada, nomor 62….
                const conv = items.find((item) => digitNomor(item.sender) === digitNomor(row.sender));
                const rowSender = conv?.sender || row.sender;
                const nama = row.name || conv?.name || '';
                const telat = Date.now() - new Date(row.oldestAt).getTime() >= TERLAMBAT_MS;
                return (
                  <button
                    key={row.sender}
                    type="button"
                    data-waiting={row.sender}
                    className={`wa-item${rowSender === selected ? ' on' : ''}`}
                    onClick={() => {
                      setSelected(rowSender);
                      setSelectedInfo({ sender: rowSender, name: nama });
                      setOpened((prev) => new Set(prev).add(rowSender));
                    }}
                  >
                    <div className="wa-av">{inisial(nama, row.sender)}</div>
                    <div className="wa-item-body">
                      <div className="wa-item-top">
                        <b>{nama || rapikanNomor(row.sender)}</b>
                        <span className={telat ? 'wa-late' : undefined} title="Sudah menunggu sejak pertanyaan tertua">
                          {lamaMenunggu(row.oldestAt)}
                        </span>
                      </div>
                      <div className="wa-item-bottom">
                        <span className="wa-preview">{row.latestReason || '—'}</span>
                        <span className="wa-badge" title="Jumlah pertanyaan menunggu">{row.count}</span>
                      </div>
                      {row.repeated ? <span className="wa-flag">berulang</span> : null}
                    </div>
                  </button>
                );
              })
            )
          ) : loading ? (
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

            {escalations.length ? (
              <div className="wa-esc" data-testid="wa-esc">
                <div className="wa-esc-title">
                  Pertanyaan AI menunggu ({escalations.length})
                  <small>Membalas customer ini otomatis menandainya terjawab.</small>
                </div>
                {escalations.map((item) => (
                  <div className="wa-esc-item" key={item.id} data-esc={item.id}>
                    <div className="wa-esc-body">
                      <b>{item.reason || 'Perlu bantuan admin'}</b>
                      {item.summary ? <span>{item.summary}</span> : null}
                      <small>{waktu(item.createdAt)}</small>
                    </div>
                    <button
                      type="button"
                      className="btn sm"
                      disabled={closingEsc !== ''}
                      onClick={() => void onCloseEscalation(item.id)}
                    >
                      {closingEsc === item.id ? 'Menutup…' : 'Tandai selesai'}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="wa-thread">
              {loadingThread ? (
                <div className="empty">Memuat pesan…</div>
              ) : messages.length === 0 ? (
                <div className="empty">Belum ada pesan.</div>
              ) : (
                messages.map((row) => (
                  <div key={row.id} className="wa-row">
                    {row.message || row.media_url ? (
                      <div className="wa-bubble in">
                        {row.media_url ? (
                          <a
                            className="wa-media"
                            href={row.media_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img
                              src={row.media_url}
                              alt={row.filename || 'Lampiran'}
                              loading="lazy"
                              onError={(event) => {
                                event.currentTarget.parentElement?.classList.add('gone');
                              }}
                            />
                          </a>
                        ) : null}
                        {row.message ? <div className="wa-text">{row.message}</div> : null}
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
                          {row.error === 'dibalas manual'
                            ? ' · manual'
                            : row.handled_by
                              ? ` · ${row.handled_by === 'local' ? 'Local' : 'Server'}`
                              : ' · bot'}
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
