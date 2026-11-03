'use client';

import { Icon } from '@/components/ui/Icon';
import { formatDateTime } from '@/lib/utils/format';
import { MEMORY_STATUS_CLASS, MEMORY_STATUS_LABELS } from './memory-labels';
import type { MemoryItem } from './memory-repository';

function preview(content: string): string {
  return content.replace(/\s+/g, ' ').slice(0, 260);
}

export function MemoryCard({
  item,
  onEdit,
  onDelete,
}: {
  item: MemoryItem;
  onEdit: (item: MemoryItem) => void;
  onDelete: (item: MemoryItem) => void;
}) {
  return (
    <div className="ai-memory-item">
      <div className="row sp wrap">
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
        <div className="row">
          <button className="btn sm" onClick={() => onEdit(item)}>
            <Icon name="pencil" />
            Edit
          </button>
          <button className="btn sm" onClick={() => onDelete(item)}>
            <Icon name="trash-2" />
            Hapus
          </button>
        </div>
      </div>
      <p className="content">{preview(item.content)}</p>
    </div>
  );
}
