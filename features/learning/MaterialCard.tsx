'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

import { ProgressBar } from '@/components/ui/ProgressBar';
import type { Material, MaterialProgress } from '@/lib/types';

export function MaterialStatusTag({ status }: { status: MaterialProgress['status'] }) {
  if (status === 'done') {
    return (
      <span className="tag gr">
        <Icon name="check" size={12} />
        Selesai
      </span>
    );
  }
  if (status === 'progress') return <span className="tag yl">Sedang dipelajari</span>;
  return <span className="tag">Belum dimulai</span>;
}

interface MaterialCardProps {
  material: Material;
  progress: MaterialProgress;
  canManage?: boolean;
  hideOwnerActions?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function MaterialCard({
  material,
  progress,
  canManage = false,
  hideOwnerActions = false,
  onEdit,
  onDelete,
}: MaterialCardProps) {
  const router = useRouter();
  const open = () => router.push(`/learning?id=${encodeURIComponent(material.id)}`);

  return (
    <div
      className="card ck"
      style={{ display: 'flex', flexDirection: 'column' }}
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
    >
      <div className="row sp" style={{ gap: 6 }}>
        <span className="tag">{material.category}</span>
        <MaterialStatusTag status={progress.status} />
      </div>
      <h3 className="mt" style={{ fontSize: 16 }}>
        {material.title}
      </h3>
      <p className="sm muted mt1" style={{ flex: 1 }}>
        {material.description}
      </p>
      <div className="row sp mt xs muted">
        <span className="row" style={{ gap: 5 }}>
          <Icon name="clock" size={14} />
          {material.durationMinutes} menit
        </span>
        <span>{progress.progress}%</span>
      </div>
      <ProgressBar value={progress.progress} className="mt1" />
      {canManage && !hideOwnerActions ? (
        <div className="row mt">
          <button
            className="btn sm"
            onClick={(event) => {
              event.stopPropagation();
              onEdit?.();
            }}
          >
            <Icon name="pencil" />
            Edit
          </button>
          <button
            className="btn sm danger"
            onClick={(event) => {
              event.stopPropagation();
              onDelete?.();
            }}
          >
            <Icon name="trash-2" />
            Hapus
          </button>
        </div>
      ) : null}
    </div>
  );
}
