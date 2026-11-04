'use client';

import { AppLink as Link } from '@/components/ui/AppLink';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useData } from '@/components/providers/DataProvider';
import { useModal } from '@/components/providers/ModalProvider';
import { useSession } from '@/components/providers/SessionProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/Note';
import { PageHeader } from '@/components/ui/PageHeader';
import { PipeTable } from '@/components/ui/PipeTable';
import { CaseMarkTag } from '@/components/ui/badges';
import type { AssistantAnswer, AssistantSection, AssistantSource } from '@/lib/ai/types';
import { copyToClipboard } from '@/lib/utils/clipboard';
import { formatDateTime } from '@/lib/utils/format';

const RETENTION_OPTIONS = [
  { value: 0, label: 'Simpan selamanya' },
  { value: 7, label: '7 hari' },
  { value: 30, label: '30 hari' },
  { value: 90, label: '90 hari' },
  { value: 180, label: '180 hari' },
  { value: 365, label: '1 tahun' },
];

export function AssistantView() {
  const { snapshot } = useData();
  const {
    assistant,
    assistantBusy,
    assistantMode,
    askAssistant,
    conversations,
    activeConversationId,
    startNewConversation,
    openConversation,
    deleteConversation,
    clearAllConversations,
    retentionDays,
    updateRetention,
    storageAvailable,
    assistantReady,
  } = useSession();
  const { showToast } = useToast();
  const { openModal, closeModal } = useModal();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryParam = searchParams.get('q') ?? '';
  const handledQuery = useRef('');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = chatRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [assistant.length, assistantBusy]);

  useEffect(() => {
    if (!queryParam || handledQuery.current === queryParam) return;
    handledQuery.current = queryParam;
    askAssistant(queryParam);
    router.replace('/assistant');
  }, [askAssistant, queryParam, router]);

  const suggestions = useMemo(() => {
    const products = snapshot.content.products;
    const garment = products.find((product) =>
      ['Thobe', 'Gamis', 'Koko'].includes(product.category),
    );
    const fabrics = products.filter((product) => product.category === 'Fabric Collection');
    const items: string[] = [];
    if (garment) items.push(`Berapa harga dan stok ${garment.name}?`);
    if (fabrics.length >= 2) {
      items.push(`Apa perbedaan bahan ${fabrics[0].code} dan ${fabrics[1].code}?`);
    }
    items.push('Produk thobe apa saja?');
    items.push('Customer komplain jahitan lepas, gimana balasnya?');
    items.push('Customer bilang harganya mahal, harus jawab apa?');
    items.push('Bagaimana cara merekomendasikan ukuran thobe?');
    items.push('Bagaimana menjelaskan Create Your Price?');
    items.push('Bagaimana menangani customer yang meminta refund?');
    return [...new Set(items)];
  }, [snapshot.content.products]);

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conversation) =>
      conversation.title.toLowerCase().includes(term),
    );
  }, [conversations, search]);

  const activeConversation = conversations.find((item) => item.id === activeConversationId);

  const submit = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || assistantBusy) return;
    askAssistant(trimmed);
    setInput('');
  };

  const copy = async (text: string) => {
    const ok = await copyToClipboard(text);
    showToast(ok ? 'Berhasil disalin ke clipboard' : 'Gagal menyalin', ok ? 'ok' : 'err');
  };

  const confirmDelete = () => {
    if (!activeConversationId) return;
    openModal(
      <ConfirmDialog
        title="Hapus percakapan ini?"
        message="Pesan dalam percakapan ini akan dihapus permanen dari memori jangka panjang."
        onCancel={closeModal}
        onConfirm={async () => {
          const ok = await deleteConversation(activeConversationId);
          closeModal();
          showToast(
            ok ? 'Percakapan berhasil dihapus' : 'Gagal menghapus percakapan',
            ok ? 'ok' : 'err',
          );
        }}
      />,
    );
  };

  const confirmClearAll = () => {
    openModal(
      <ConfirmDialog
        title="Hapus semua riwayat percakapan?"
        message="Seluruh percakapan AI milik akun ini akan dihapus permanen. Pengetahuan resmi Samaqu tidak terhapus."
        onCancel={closeModal}
        onConfirm={async () => {
          const ok = await clearAllConversations();
          closeModal();
          showToast(
            ok ? 'Semua riwayat berhasil dihapus' : 'Gagal menghapus riwayat',
            ok ? 'ok' : 'err',
          );
        }}
      />,
    );
  };

  const changeRetention = (value: number) => {
    void updateRetention(value).then(() => {
      showToast('Masa simpan riwayat diperbarui');
    });
  };

  return (
    <>
      <PageHeader
        eyebrow="AI Tools"
        title="AI Knowledge Assistant"
        subtitle="Tanyakan seputar produk, script, studi kasus, problem solving, dan standar komunikasi Samaqu."
        actions={
          <span className={`tag ${assistantMode === 'local' ? 'yl' : 'gr'}`}>
            <Icon name="bot" />
            {assistantMode === 'remote'
              ? 'Xiaomi MiMo'
              : assistantMode === 'local'
                ? 'Fallback lokal'
                : 'AI Assistant'}
          </span>
        }
      />

      <div className="ai-assistant-layout">
        <aside className="card ai-conv-panel">
          <div className="row sp">
            <b className="sm">Riwayat Percakapan</b>
            <button className="btn sm" onClick={startNewConversation} disabled={assistantBusy}>
              <Icon name="plus" />
              Baru
            </button>
          </div>

          <div className="search mt">
            <Icon name="search" />
            <input
              className="inp"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari percakapan…"
              aria-label="Cari percakapan"
            />
          </div>

          {!storageAvailable ? (
            <Note variant="warn" className="mt1">
              Supabase belum terkonfigurasi. Percakapan hanya hidup selama sesi ini.
            </Note>
          ) : null}

          <div className="ai-conv-list mt1">
            {!assistantReady ? (
              <div className="xs muted" style={{ padding: 10 }}>
                Memuat riwayat…
              </div>
            ) : filteredConversations.length ? (
              filteredConversations.map((conversation) => (
                <div
                  className={`ai-conv-item${conversation.id === activeConversationId ? ' on' : ''}`}
                  key={conversation.id}
                >
                  <button
                    className="ai-conv-open"
                    onClick={() => void openConversation(conversation.id)}
                    disabled={assistantBusy}
                  >
                    <span>{conversation.title}</span>
                    <small>{formatDateTime(conversation.updatedAt)}</small>
                  </button>
                  <button
                    className="icb"
                    aria-label={`Hapus ${conversation.title}`}
                    onClick={() => {
                      openModal(
                        <ConfirmDialog
                          title="Hapus percakapan ini?"
                          message={`"${conversation.title}" akan dihapus permanen dari memori jangka panjang.`}
                          onCancel={closeModal}
                          onConfirm={async () => {
                            const ok = await deleteConversation(conversation.id);
                            closeModal();
                            showToast(
                              ok ? 'Percakapan berhasil dihapus' : 'Gagal menghapus percakapan',
                              ok ? 'ok' : 'err',
                            );
                          }}
                        />,
                      );
                    }}
                  >
                    <Icon name="trash-2" size={14} />
                  </button>
                </div>
              ))
            ) : (
              <div className="xs muted" style={{ padding: 10 }}>
                {search ? 'Percakapan tidak ditemukan.' : 'Belum ada riwayat. Mulai bertanya untuk menyimpan percakapan.'}
              </div>
            )}
          </div>

          <div className="ai-retention">
            <label className="flab" htmlFor="ai-retention">
              Masa simpan riwayat
            </label>
            <select
              id="ai-retention"
              className="inp"
              value={retentionDays}
              onChange={(event) => changeRetention(Number(event.target.value))}
              disabled={!storageAvailable}
            >
              {RETENTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="xs muted mt1">
              Riwayat lebih lama dari batas ini dihapus otomatis saat Assistant dibuka.
            </p>
            {conversations.length ? (
              <button className="btn sm mt1" onClick={confirmClearAll}>
                <Icon name="trash-2" />
                Hapus semua riwayat
              </button>
            ) : null}
          </div>
        </aside>

        <div className="card ai-chat-panel">
          <div className="row sp wrap" style={{ marginBottom: 12 }}>
            <div>
              <b>{activeConversation?.title ?? 'Percakapan Baru'}</b>
              <div className="xs muted">
                {assistantMode === 'remote'
                  ? 'Konteks percakapan aktif · memori jangka panjang tersimpan'
                  : assistantMode === 'local'
                    ? 'Mode lokal · percakapan ini belum tersimpan sebagai memori AI'
                    : 'Mulai percakapan baru dengan knowledge Samaqu'}
              </div>
            </div>
            <div className="row">
              {activeConversationId ? (
                <button className="btn sm" onClick={confirmDelete} disabled={assistantBusy}>
                  <Icon name="trash-2" />
                  Hapus
                </button>
              ) : null}
              <button className="btn sm" onClick={startNewConversation} disabled={assistantBusy}>
                <Icon name="plus" />
                Percakapan Baru
              </button>
            </div>
          </div>

          <div className="chat" ref={chatRef}>
            {assistant.length ? (
              assistant.map((entry, index) => {
                if (entry.role === 'user') {
                  return (
                    <div
                      className="bubble ba"
                      style={{ alignSelf: 'flex-end', whiteSpace: 'normal' }}
                      key={`u-${index}`}
                    >
                      {entry.question}
                    </div>
                  );
                }
                return (
                  <div
                    className="bubble bai"
                    style={{ maxWidth: '92%', whiteSpace: 'normal' }}
                    key={`a-${index}`}
                  >
                    <div className="row sp" style={{ marginBottom: 4 }}>
                      <div className="who" style={{ color: 'var(--g)' }}>
                        ✦ Samaqu AI Assistant
                      </div>
                      {entry.fallback ? (
                        <span className="tag yl">Lokal</span>
                      ) : entry.model ? (
                        <span className="tag">{entry.model}</span>
                      ) : null}
                    </div>
                    {entry.answer ? (
                      <AssistantAnswerView answer={entry.answer} onCopy={copy} />
                    ) : entry.text ? (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{entry.text}</div>
                    ) : null}
                    {entry.sources?.length ? <SourceList sources={entry.sources} /> : null}
                    {entry.note ? <div className="answer-note">{entry.note}</div> : null}
                  </div>
                );
              })
            ) : (
              <div className="empty">
                <Icon name="sparkles" size={28} style={{ color: 'var(--g)' }} />
                <p className="mt1">
                  <b style={{ color: 'var(--t)' }}>Halo! Ada yang bisa dibantu?</b>
                </p>
                <p className="sm">Pilih contoh pertanyaan di bawah atau ketik sendiri.</p>
              </div>
            )}
            {assistantBusy ? (
              <div className="bubble bai typing">
                <span />
                <span />
                <span />
              </div>
            ) : null}
          </div>

          <div className="chips mt">
            {suggestions.map((question) => (
              <button
                className="chip"
                onClick={() => submit(question)}
                key={question}
                disabled={assistantBusy}
              >
                {question}
              </button>
            ))}
          </div>

          <div className="cin">
            <input
              className="inp"
              placeholder="Ketik pertanyaan…"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit(input);
              }}
              aria-label="Pertanyaan untuk Knowledge Assistant"
              disabled={assistantBusy}
            />
            <button className="btn p" onClick={() => submit(input)} disabled={assistantBusy}>
              <Icon name="send" />
            </button>
          </div>

          {assistantMode === 'local' ? (
            <Note variant="warn" icon="shield-alert" className="mt">
              Jawaban memakai pencarian lokal, bukan model Xiaomi MiMo. Owner perlu mengisi API Key
              di <Link href="/settings/ai">Pengaturan AI</Link> agar jawaban memakai knowledge brain
              penuh dan tersimpan sebagai memori.
            </Note>
          ) : (
            <Note variant="neutral" icon="shield-check" className="mt">
              AI hanya memakai knowledge berstatus <b>Published</b> dan memory yang sudah disetujui.
              Selalu cocokkan keputusan akhir dengan <b>SOP resmi Samaqu</b>.
            </Note>
          )}
        </div>
      </div>
    </>
  );
}

function SourceList({ sources }: { sources: AssistantSource[] }) {
  return (
    <div className="ai-sources">
      <div className="ai-sources-title">
        <Icon name="library" size={14} />
        Sumber referensi
      </div>
      {sources.map((source) => (
        <div className="ai-source" key={source.id}>
          <div>
            <b>{source.title}</b>
            <div className="xs muted">
              {source.source} · {source.category}
            </div>
          </div>
          <span className="tag gr">
            {source.status === 'published' ? 'Published' : source.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function AssistantAnswerView({
  answer,
  onCopy,
}: {
  answer: AssistantAnswer;
  onCopy: (text: string) => void;
}) {
  return (
    <>
      {answer.sections.map((section, index) => (
        <SectionView key={index} section={section} onCopy={onCopy} />
      ))}
      {answer.note ? <div className="answer-note">{answer.note}</div> : null}
      {answer.source ? <div className="answer-source">{answer.source}</div> : null}
    </>
  );
}

function SectionView({
  section,
  onCopy,
}: {
  section: AssistantSection;
  onCopy: (text: string) => void;
}) {
  if (section.kind === 'text') {
    return (
      <div className="answer-section">
        {section.title ? <div className="answer-title">{section.title}</div> : null}
        <div style={{ whiteSpace: 'pre-wrap' }}>{section.text}</div>
      </div>
    );
  }

  if (section.kind === 'product-list') {
    return (
      <div className="answer-section">
        <div className="answer-title">{section.title}</div>
        <ul className="answer-list">
          {section.products.map((product) => (
            <li key={product.id}>
              <Link className="answer-link" href={`/products?open=${encodeURIComponent(product.id)}`}>
                {product.name}
              </Link>
              {product.code ? ` · ${product.code}` : ''}
              {product.status ? ` · ${product.status}` : ''}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (section.kind === 'product-detail') {
    return (
      <div className="answer-section">
        <div className="answer-title">
          <Link
            className="answer-link"
            href={`/products?open=${encodeURIComponent(section.product.id)}`}
          >
            {section.product.name}
          </Link>{' '}
          <span className="tag">{section.product.category}</span>
        </div>
        <div className="answer-table">
          <table>
            <tbody>
              {section.fields.map((field) => (
                <tr key={field.label}>
                  <th style={{ width: '40%' }}>{field.label}</th>
                  <td>
                    {field.table ? (
                      <PipeTable value={field.table} />
                    ) : field.productIds?.length ? (
                      field.productIds.map((id, index) => (
                        <span key={id}>
                          {index ? ', ' : ''}
                          <Link className="answer-link" href={`/products?open=${encodeURIComponent(id)}`}>
                            {field.value}
                          </Link>
                        </span>
                      ))
                    ) : (
                      <span style={{ whiteSpace: 'pre-wrap' }}>{field.value}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (section.kind === 'comparison') {
    return (
      <div className="answer-section">
        <div className="answer-title">{section.title}</div>
        <div className="answer-table">
          <table>
            <thead>
              <tr>
                <th />
                {section.products.map((product) => (
                  <th key={product.id}>
                    <Link
                      className="answer-link"
                      href={`/products?open=${encodeURIComponent(product.id)}`}
                    >
                      {product.name}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row) => (
                <tr key={row.label}>
                  <th>{row.label}</th>
                  {row.values.map((value, index) => (
                    <td key={index} style={{ whiteSpace: 'pre-wrap' }}>
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (section.kind === 'scripts') {
    return (
      <div className="answer-section">
        <div className="answer-title">{section.title}</div>
        {section.items.map((script) => (
          <div className="answer-card" key={script.id}>
            <div className="answer-card-head">
              <Link
                className="answer-link"
                href={`/scripts?tab=script&open=${encodeURIComponent(script.id)}`}
              >
                {script.title}
              </Link>
              <span className="tag gr">{script.category}</span>
            </div>
            <div className="after sm mt1" style={{ whiteSpace: 'pre-wrap' }}>
              {script.response}
            </div>
            {script.notes ? <div className="sm muted mt1">{script.notes}</div> : null}
            <button className="btn sm mt1" onClick={() => onCopy(script.response)}>
              <Icon name="copy" />
              Copy script
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (section.kind === 'cases') {
    return (
      <div className="answer-section">
        <div className="answer-title">{section.title}</div>
        {section.items.map((caseStudy) => (
          <div className="answer-card" key={caseStudy.id}>
            <div className="answer-card-head">
              <Link
                className="answer-link"
                href={`/scripts?tab=case&open=${encodeURIComponent(caseStudy.id)}`}
              >
                {caseStudy.title}
              </Link>
              <CaseMarkTag mark={caseStudy.mark} />
            </div>
            {caseStudy.adminPrevious && caseStudy.mark === 'Perlu Perbaikan' ? (
              <div className="sm mt1">
                <span style={{ color: 'var(--red)' }}>Hindari:</span> {caseStudy.adminPrevious}
              </div>
            ) : null}
            <div className="after sm mt1" style={{ whiteSpace: 'pre-wrap' }}>
              {caseStudy.recommendation}
            </div>
            <div className="sm muted mt1">
              <b>Pelajaran:</b> {caseStudy.lesson}
            </div>
            <button className="btn sm mt1" onClick={() => onCopy(caseStudy.recommendation)}>
              <Icon name="copy" />
              Copy respons
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (section.kind === 'before-after') {
    return (
      <div className="answer-section">
        <div className="answer-title">{section.title}</div>
        {section.items.map((item) => (
          <div className="answer-card" key={item.id}>
            <b className="sm">{item.title}</b>
            <div className="before sm mt1">{item.before}</div>
            <div className="after sm mt1">{item.after}</div>
            <div className="sm muted mt1">{item.why}</div>
          </div>
        ))}
      </div>
    );
  }

  if (section.kind === 'problem') {
    return (
      <div className="answer-section">
        <div className="answer-title">Problem Solving</div>
        <div className="answer-card">
          <Link
            className="answer-link"
            href={`/problems?id=${encodeURIComponent(section.item.id)}`}
          >
            {section.item.title}
          </Link>
          <ol className="steps mt1" style={{ fontSize: 13 }}>
            {section.item.process.slice(0, 5).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {section.item.sop ? null : (
            <div className="xs mt1" style={{ color: 'var(--warn)' }}>
              Kebijakan belum dikonfigurasi. Verifikasi ke supervisor.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (section.kind === 'guide') {
    return (
      <div className="answer-section">
        <div className="answer-title">Communication Guidelines</div>
        <div className="answer-card">
          <Link
            className="answer-link"
            href={`/guidelines?section=${encodeURIComponent(section.item.id)}`}
          >
            {section.item.title}
          </Link>
          <div className="sm muted mt1">{section.item.takeaway}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="answer-section">
      <div className="answer-title">Chat Flow</div>
      <div className="answer-card">
        <Link
          className="answer-link"
          href={`/flow?stage=${encodeURIComponent(section.item.id)}`}
        >
          {section.item.title}
        </Link>
        <div className="sm muted mt1">{section.item.goal}</div>
      </div>
    </div>
  );
}
