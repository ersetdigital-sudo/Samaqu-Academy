'use client';

import { AppLink as Link } from '@/components/ui/AppLink';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useSession } from '@/components/providers/SessionProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/Note';
import { PageHeader } from '@/components/ui/PageHeader';
import { PipeTable } from '@/components/ui/PipeTable';
import { CaseMarkTag } from '@/components/ui/badges';
import type { AssistantAnswer, AssistantSection } from '@/lib/ai/types';
import { copyToClipboard } from '@/lib/utils/clipboard';

export function AssistantView() {
  const { snapshot } = useData();
  const { assistant, assistantBusy, askAssistant } = useSession();
  const { showToast } = useToast();
  const [input, setInput] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = chatRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [assistant.length, assistantBusy]);

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

  return (
    <>
      <PageHeader
        eyebrow="AI Tools"
        title="AI Knowledge Assistant"
        subtitle="Tanyakan seputar produk, script, studi kasus, problem solving, dan standar komunikasi Samaqu."
        actions={
          <span className="tag demo">
            <Icon name="flask-conical" />
            Demo lokal · bukan AI
          </span>
        }
      />

      <div className="card" style={{ maxWidth: 860, margin: '0 auto' }}>
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
                  <div className="who" style={{ color: 'var(--g)' }}>
                    ✦ Samaqu Assistant
                  </div>
                  {entry.answer ? (
                    <AssistantAnswerView answer={entry.answer} onCopy={copy} />
                  ) : null}
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
            <button className="chip" onClick={() => submit(question)} key={question}>
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
          />
          <button className="btn p" onClick={() => submit(input)} disabled={assistantBusy}>
            <Icon name="send" />
          </button>
        </div>

        <Note variant="neutral" icon="shield-check" className="mt">
          Jawaban adalah contoh dari knowledge base dummy. Selalu ikuti <b>SOP dan informasi resmi perusahaan</b>.
        </Note>
      </div>
    </>
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
          {section.product.sample ? <span className="tag yl">Data contoh</span> : null}
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
