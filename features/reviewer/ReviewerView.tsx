'use client';

import { useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useModal } from '@/components/providers/ModalProvider';
import { useSession } from '@/components/providers/SessionProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/Note';
import { PageHeader } from '@/components/ui/PageHeader';
import { ScoreBars } from '@/components/ui/ScoreBars';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { analyzeConversation } from '@/lib/ai/reviewer';
import { REVIEW_SAMPLE } from '@/lib/ai/sample';
import { REVIEW_ASPECTS } from '@/lib/constants';
import type { ReviewMessage } from '@/lib/types';
import { anonymize } from '@/lib/utils/anonymize';
import { copyToClipboard } from '@/lib/utils/clipboard';

export function ReviewerView() {
  const { snapshot, logActivity } = useData();
  const { review, setReview } = useSession();
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();

  const updateMessages = (messages: ReviewMessage[]) => {
    setReview((previous) => ({ ...previous, messages, result: undefined }));
  };

  const updateMessage = (index: number, patch: Partial<ReviewMessage>) => {
    const messages = review.messages.map((message, messageIndex) =>
      messageIndex === index ? { ...message, ...patch } : message,
    );
    updateMessages(messages);
  };

  const addMessage = (role: 'c' | 'a') => {
    updateMessages([...review.messages, { role, text: '' }]);
  };

  const removeMessage = (index: number) => {
    updateMessages(review.messages.filter((_, messageIndex) => messageIndex !== index));
  };

  const loadSample = () => {
    setReview({ messages: REVIEW_SAMPLE.map((message) => ({ ...message })), analyzing: false });
  };

  const clearMessages = () => {
    setReview({ messages: [], analyzing: false });
  };

  const analyze = async () => {
    const filled = review.messages.filter((message) => message.text.trim());
    if (
      filled.length < 2 ||
      !filled.some((message) => message.role === 'a') ||
      !filled.some((message) => message.role === 'c')
    ) {
      showToast('Masukkan minimal 1 pesan customer dan 1 pesan admin', 'err');
      return;
    }
    setReview((previous) => ({ ...previous, analyzing: true }));
    const result = await analyzeConversation(filled, {
      products: snapshot.content.products,
      scripts: snapshot.content.scripts,
      cases: snapshot.content.cases,
    });
    setReview((previous) => ({ ...previous, analyzing: false, result }));
    void logActivity('review', 'AI Chat Reviewer', result.overall);
  };

  const copyRecommendation = async () => {
    if (!review.result?.rec) return;
    const ok = await copyToClipboard(review.result.rec.text);
    showToast(ok ? 'Rekomendasi berhasil disalin' : 'Gagal menyalin', ok ? 'ok' : 'err');
  };

  const openPaste = () => {
    openModal(
      <PasteChatForm
        onCancel={closeModal}
        onApply={(messages) => {
          setReview({ messages, analyzing: false });
          closeModal();
        }}
      />,
      { large: true },
    );
  };

  const result = review.result;

  return (
    <>
      <PageHeader
        eyebrow="AI Tools"
        title="AI Chat Reviewer"
        subtitle="Tempel percakapan customer, pisahkan pesan customer dan admin, lalu dapatkan evaluasi dan saran perbaikan."
        actions={
          <span className="tag demo">
            <Icon name="flask-conical" />
            Simulasi lokal · skor heuristik
          </span>
        }
      />

      <div style={{ marginBottom: 18 }}>
        <Note variant="neutral">
          Evaluasi dihitung dengan aturan sederhana di browser (kata kunci, panjang pesan, pola
          respons). Ini <b>bukan penilaian AI sungguhan</b>. Gunakan sebagai bahan diskusi dengan
          senior.
        </Note>
      </div>

      <div className="split">
        <div className="card">
          <div className="row sp wrap">
            <h2>Percakapan</h2>
            <div className="row wrap">
              <button className="btn sm" onClick={loadSample}>
                <Icon name="file-text" />
                Contoh
              </button>
              <button className="btn sm" onClick={openPaste}>
                <Icon name="clipboard-paste" />
                Tempel teks
              </button>
              <button className="btn sm" onClick={clearMessages}>
                <Icon name="trash-2" />
                Kosongkan
              </button>
            </div>
          </div>

          <div className="mt">
            {review.messages.length ? (
              review.messages.map((message, index) => (
                <div className="review-row" key={index}>
                  <select
                    className="inp"
                    style={{ width: 122, flexShrink: 0 }}
                    value={message.role}
                    onChange={(event) =>
                      updateMessage(index, { role: event.target.value as 'c' | 'a' })
                    }
                    aria-label="Peran pengirim"
                  >
                    <option value="c">Customer</option>
                    <option value="a">Admin</option>
                  </select>
                  <textarea
                    className="inp review-textarea"
                    rows={1}
                    placeholder="Tulis pesan…"
                    value={message.text}
                    onChange={(event) => updateMessage(index, { text: event.target.value })}
                  />
                  <button className="icb" onClick={() => removeMessage(index)} aria-label="Hapus pesan">
                    <Icon name="x" />
                  </button>
                </div>
              ))
            ) : (
              <EmptyState
                icon="message-square"
                title="Belum ada pesan"
                subtitle="Tambahkan pesan customer dan admin, atau tempel teks percakapan."
              />
            )}
          </div>

          <div className="row mt wrap">
            <button className="btn sm" onClick={() => addMessage('c')}>
              <Icon name="plus" />
              Pesan Customer
            </button>
            <button className="btn sm" onClick={() => addMessage('a')}>
              <Icon name="plus" />
              Pesan Admin
            </button>
            <button
              className="btn p"
              style={{ marginLeft: 'auto' }}
              onClick={() => void analyze()}
              disabled={review.analyzing}
            >
              <Icon name="sparkles" />
              {review.analyzing ? 'Menganalisis…' : 'Analyze Conversation'}
            </button>
          </div>
        </div>

        <div className="card">
          <h3>10 Aspek Penilaian</h3>
          <div className="mt1">
            {REVIEW_ASPECTS.map((aspect, index) => (
              <div className="li sm" style={{ padding: '8px 0' }} key={aspect}>
                <span className="gnum">{String(index + 1).padStart(2, '0')}</span>
                {aspect}
              </div>
            ))}
          </div>
          <p className="xs muted mt">
            Skor 0–100. Aspek yang tidak relevan dengan percakapan tidak dihitung.
          </p>
        </div>
      </div>

      {review.analyzing ? (
        <div className="card empty mt">
          <div className="typing">
            <span />
            <span />
            <span />
          </div>
          <p className="mt1">Menganalisis percakapan (simulasi lokal)…</p>
        </div>
      ) : result ? (
        <div className="mt">
          <div className="grid g2">
            <div className="card">
              <div className="row wrap" style={{ gap: 20 }}>
                <ScoreRing value={result.overall} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <h2>Hasil Evaluasi</h2>
                  <p className="sm muted">
                    {result.overall >= 80
                      ? 'Percakapan sudah baik.'
                      : result.overall >= 65
                        ? 'Cukup baik, masih ada ruang perbaikan.'
                        : 'Perlu banyak perbaikan.'}{' '}
                    <span className="tag demo">
                      <Icon name="flask-conical" />
                      Heuristik lokal
                    </span>
                  </p>
                </div>
              </div>
              <div className="mt">
                <ScoreBars items={result.dims} />
              </div>
            </div>

            <div>
              <div className="card">
                <h3>Hal yang Sudah Baik</h3>
                {(result.good.length ? result.good : ['Belum ada aspek dengan skor tinggi.']).map(
                  (item) => (
                    <div className="row mt1 sm" style={{ alignItems: 'flex-start' }} key={item}>
                      <Icon
                        name="check-circle-2"
                        size={15}
                        style={{ color: 'var(--acc)', flexShrink: 0, marginTop: 3 }}
                      />
                      {item}
                    </div>
                  ),
                )}
                <h3 className="mt">Perlu Diperbaiki</h3>
                {(result.improve.length
                  ? result.improve
                  : ['Tidak ada aspek dengan skor rendah.']
                ).map((item) => (
                  <div className="row mt1 sm" style={{ alignItems: 'flex-start' }} key={item}>
                    <Icon
                      name="alert-circle"
                      size={15}
                      style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 3 }}
                    />
                    {item}
                  </div>
                ))}
              </div>

              <div className="card mt">
                <h3>Rekomendasi Respons</h3>
                {result.rec ? (
                  <>
                    <div className="after sm mt1" style={{ whiteSpace: 'pre-wrap' }}>
                      {result.rec.text}
                    </div>
                    <div className="xs muted mt1">Sumber: {result.rec.source}</div>
                    <button className="btn sm mt1" onClick={() => void copyRecommendation()}>
                      <Icon name="copy" />
                      Copy
                    </button>
                  </>
                ) : (
                  <p className="sm muted mt1">
                    Tidak ada script yang cocok dengan pesan terakhir customer. Cek Script Library
                    atau tanyakan ke supervisor.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="card mt">
            <h3>Contoh Perbaikan per Pesan</h3>
            {result.flagged.length ? (
              result.flagged.map((flagged, index) => (
                <div
                  className="mt"
                  style={{ borderTop: '1px solid var(--b)', paddingTop: 12 }}
                  key={`${index}-${flagged.text}`}
                >
                  <div className="before sm">"{flagged.text}"</div>
                  {flagged.issues.map(([title, advice]) => (
                    <div
                      className="row mt1 sm"
                      style={{ alignItems: 'flex-start' }}
                      key={`${title}-${advice}`}
                    >
                      <Icon
                        name="corner-down-right"
                        size={15}
                        style={{ flexShrink: 0, marginTop: 3 }}
                      />
                      <span>
                        <b>{title}:</b> {advice}
                      </span>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <p className="sm muted mt1">Tidak ada pesan admin yang ditandai.</p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function PasteChatForm({
  onApply,
  onCancel,
}: {
  onApply: (messages: ReviewMessage[]) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const { showToast } = useToast();

  const apply = () => {
    const messages = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({
        role: /^a\s*:/i.test(line) ? ('a' as const) : ('c' as const),
        text: anonymize(line.replace(/^[ac]\s*:\s*/i, ''), []),
      }));
    if (!messages.length) {
      showToast('Teks percakapan masih kosong', 'err');
      return;
    }
    onApply(messages);
  };

  return (
    <>
      <div className="row sp">
        <h2>Tempel Percakapan</h2>
        <button className="icb" onClick={onCancel} aria-label="Tutup">
          <Icon name="x" />
        </button>
      </div>
      <p className="sm muted mt1">
        Satu pesan per baris. Awali &quot;C:&quot; untuk customer dan &quot;A:&quot; untuk admin.
        Data pribadi (HP, email, rekening) otomatis disamarkan.
      </p>
      <textarea
        className="inp mt"
        rows={9}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={'C: Kak thobe putih ada?\nA: Ada, Kak 😊'}
      />
      <div className="mfoot">
        <button className="btn" onClick={onCancel}>
          Batal
        </button>
        <button className="btn p" onClick={apply}>
          <Icon name="check" />
          Gunakan
        </button>
      </div>
    </>
  );
}
