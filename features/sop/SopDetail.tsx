'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { Sop } from '@/lib/types';
import { formatDate } from '@/lib/utils/format';

interface SopDetailProps {
  item: Sop;
  canManage: boolean;
  onEdit: (item: Sop) => void;
  onDelete: (item: Sop) => void;
}

/** Menu titik tiga: Hapus. Menutup lewat klik di luar atau Escape. */
function SopMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="sop-menu" ref={wrapRef}>
      <button
        type="button"
        className="icb"
        aria-label="Menu lainnya"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="sop-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </button>
      {open ? (
        <div className="sop-menu-pop" role="menu">
          <button
            type="button"
            role="menuitem"
            className="sop-menu-item danger"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <Icon name="trash-2" size={15} />
            Hapus SOP
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Kartu detail SOP terpilih. Hanya menampilkan field yang memang ada di data. */
export function SopDetail({ item, canManage, onEdit, onDelete }: SopDetailProps) {
  return (
    <article className="card sop-detail" id="sop-detail">
      <div className="sop-detail-head">
        <h2>{item.title}</h2>
        {canManage ? (
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn sm" onClick={() => onEdit(item)}>
              <Icon name="pencil" />
              Edit
            </button>
            <SopMenu onDelete={() => onDelete(item)} />
          </div>
        ) : null}
      </div>

      {item.updatedAt ? (
        <div className="sop-meta">
          <span className="sop-meta-ic">
            <Icon name="refresh-cw" size={16} />
          </span>
          <div>
            <div className="sop-meta-l">Terakhir Direvisi</div>
            <div className="sop-meta-v">{formatDate(item.updatedAt)}</div>
          </div>
        </div>
      ) : null}

      <div className="note gn sop-purpose">
        <Icon name="target" />
        <div>
          <b>Tujuan</b>
          <div>{item.purpose}</div>
        </div>
      </div>

      <section className="card flat sop-steps">
        <div className="kh">
          <Icon name="clipboard-list" />
          <h3>Langkah Prosedur</h3>
        </div>
        <ol className="steps">
          {item.steps.map((step, index) => (
            <li key={`${index}-${step}`}>{step}</li>
          ))}
        </ol>
      </section>

      {item.notes ? (
        <details className="sop-acc" key={item.id}>
          <summary>
            <span className="row" style={{ gap: 10 }}>
              <Icon name="info" />
              <b>Catatan Penting</b>
            </span>
            <Icon name="chevron-right" className="sop-acc-chev" />
          </summary>
          <div className="sop-acc-body">{item.notes}</div>
        </details>
      ) : null}
    </article>
  );
}
