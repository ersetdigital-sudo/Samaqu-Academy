'use client';

import { AppLink as Link } from '@/components/ui/AppLink';
import type { ReactNode } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { CaseMarkTag } from '@/components/ui/badges';
import { ChatBubbles } from '@/components/ui/ChatBubbles';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/Note';
import type { CaseStudy } from '@/lib/types';
import { copyToClipboard } from '@/lib/utils/clipboard';

interface CaseDetailProps {
  caseStudy: CaseStudy;
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="mt2">
      <div className="row" style={{ gap: 8 }}>
        <span className="sic" style={{ width: 28, height: 28 }}>
          <Icon name={icon} size={14} />
        </span>
        <h3>{title}</h3>
      </div>
      <div className="mt1" style={{ paddingLeft: 36 }}>
        {children}
      </div>
    </div>
  );
}

export function CaseDetail({ caseStudy, canManage, onClose, onEdit, onDelete }: CaseDetailProps) {
  const { showToast } = useToast();

  const copy = async () => {
    const ok = await copyToClipboard(caseStudy.recommendation);
    showToast(ok ? 'Respons berhasil disalin' : 'Gagal menyalin', ok ? 'ok' : 'err');
  };

  return (
    <>
      <div className="row sp">
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="tag">{caseStudy.category}</span>
          <CaseMarkTag mark={caseStudy.mark} />
          {caseStudy.anonymized ? (
            <span className="tag">
              <Icon name="shield-check" size={12} />
              Identitas disamarkan
            </span>
          ) : null}
        </div>
        <button className="icb" onClick={onClose} aria-label="Tutup">
          <Icon name="x" />
        </button>
      </div>
      <h2 className="mt">{caseStudy.title}</h2>
      <p className="sm muted mt1">{caseStudy.situation}</p>

      <Section icon="message-circle" title="Percakapan">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: 'var(--bg)',
            borderRadius: 10,
            padding: 14,
          }}
        >
          <ChatBubbles text={caseStudy.customerMessage} />
          {caseStudy.adminPrevious ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div className="who">Respons admin sebelumnya</div>
              <div
                className="bubble ba"
                style={caseStudy.mark === 'Perlu Perbaikan' ? { background: '#7a1d14' } : undefined}
              >
                {caseStudy.adminPrevious}
              </div>
            </div>
          ) : null}
        </div>
      </Section>

      {caseStudy.finding ? (
        <Section icon="search" title="Temuan / Masalah">
          <p className="sm">{caseStudy.finding}</p>
        </Section>
      ) : null}

      {caseStudy.cause ? (
        <Section icon="git-branch" title="Analisis Penyebab">
          <p className="sm">{caseStudy.cause}</p>
        </Section>
      ) : null}

      <Section icon="message-square-text" title="Rekomendasi Respons">
        <div className="after sm" style={{ whiteSpace: 'pre-wrap' }}>
          {caseStudy.recommendation}
        </div>
        <button className="btn sm mt1" onClick={copy}>
          <Icon name="copy" />
          Copy Respons
        </button>
      </Section>

      <Section icon="lightbulb" title="Pelajaran Utama">
        <Note variant="green" className="sm">
          {caseStudy.lesson}
        </Note>
      </Section>

      <div
        className="row mt2 wrap"
        style={{ borderTop: '1px solid var(--b)', paddingTop: 16 }}
      >
        {canManage ? (
          <>
            <button className="btn" onClick={onEdit}>
              <Icon name="pencil" />
              Edit
            </button>
            <button className="btn danger" onClick={onDelete}>
              <Icon name="trash-2" />
              Hapus
            </button>
          </>
        ) : null}
        <Link className="btn" href="/simulator" style={{ marginLeft: 'auto' }}>
          <Icon name="bot" />
          Latihan di Simulator
        </Link>
      </div>
    </>
  );
}
