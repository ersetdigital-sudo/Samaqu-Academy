'use client';

import { useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { formatDateTime } from '@/lib/utils/format';
import { MEMORY_STATUS_CLASS, MEMORY_STATUS_LABELS } from './memory-labels';
import type { MemoryItem } from './memory-repository';

/**
 * Panel detail memory (slide-over dari kanan), mengikuti pola drawer detail pesanan
 * di panel admin: info ringkas di header, isi lengkap bisa di-scroll, aksi di footer.
 */
export function MemoryDetail({
  item,
  onClose,
  onEdit,
}: {
  item: MemoryItem;
  onClose: () => void;
  onEdit: (item: MemoryItem) => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Detail memory ${item.title}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="drawer-head">
          <div className="row sp wrap" style={{ gap: 12 }}>
            <div>
              <div className="row wrap" style={{ gap: 8 }}>
                <h3>{item.title}</h3>
                <span className={`tag ${MEMORY_STATUS_CLASS[item.status]}`}>
                  {MEMORY_STATUS_LABELS[item.status]}
                </span>
                <span className="tag">{item.category}</span>
              </div>
              <div className="ai-memory-meta">
                <span>Versi {item.version}</span>
                <span>·</span>
                <span>Diperbarui {formatDateTime(item.updated_at)}</span>
                {item.source ? (
                  <>
                    <span>·</span>
                    <span>Sumber: {item.source}</span>
                  </>
                ) : null}
              </div>
            </div>
            <button className="btn sm" onClick={onClose} aria-label="Tutup detail">
              <Icon name="x" />
            </button>
          </div>
        </header>

        <div className="drawer-body">
          <pre className="drawer-content">{item.content}</pre>
        </div>

        <footer className="drawer-foot">
          <button className="btn" onClick={onClose}>
            Tutup
          </button>
          <button className="btn p" onClick={() => onEdit(item)}>
            <Icon name="pencil" />
            Edit
          </button>
        </footer>
      </aside>
    </div>
  );
}
