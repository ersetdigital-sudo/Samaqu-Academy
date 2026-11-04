'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

import { ProgressBar } from '@/components/ui/ProgressBar';
import type { Material, MaterialProgress } from '@/lib/types';
import { ContributorCredit } from './ContributorCredit';
import { youtubeVideoId } from './MaterialVideo';

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

/** Thumbnail YouTube 16:9, atau placeholder netral setinggi yang sama. */
function MaterialThumb({
  material,
  order,
  locked,
}: {
  material: Material;
  order?: number;
  locked?: boolean;
}) {
  const videoId = youtubeVideoId(material.videoUrl);

  return (
    <div className="mat-thumb">
      {videoId ? (
        <>
          <img
            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
            alt={`Thumbnail video ${material.title}`}
            loading="lazy"
          />
          {locked ? (
            <span className="mat-lock" aria-hidden="true">
              <Icon name="lock" size={18} />
            </span>
          ) : (
            <span className="mat-play" aria-hidden="true">
              <Icon name="play" size={20} />
            </span>
          )}
          {material.videoDuration ? <span className="mat-dur">{material.videoDuration}</span> : null}
        </>
      ) : (
        <div className="mat-ph">
          <Icon name="book-open" size={22} />
          <span>{material.category}</span>
        </div>
      )}
      {order ? <span className="mat-no">Materi {order}</span> : null}
    </div>
  );
}

interface MaterialCardProps {
  material: Material;
  progress: MaterialProgress;
  /** Nomor urut belajar (1, 2, …) — kosongkan untuk tidak menampilkan badge. */
  order?: number;
  /** Level belum terbuka: kartu tampil redup dan tidak bisa dibuka. */
  locked?: boolean;
  canManage?: boolean;
  hideOwnerActions?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function MaterialCard({
  material,
  progress,
  order,
  locked = false,
  canManage = false,
  hideOwnerActions = false,
  onEdit,
  onDelete,
}: MaterialCardProps) {
  const router = useRouter();
  const open = () => {
    if (locked) return;
    router.push(`/learning?id=${encodeURIComponent(material.id)}`);
  };

  return (
    <div
      className={`card ck mat-card${locked ? ' locked' : ''}`}
      role="link"
      tabIndex={locked ? -1 : 0}
      aria-disabled={locked || undefined}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
    >
      <MaterialThumb material={material} order={order} locked={locked} />
      <div className="mat-body">
        <div className="row sp wrap" style={{ gap: 6 }}>
          <span className="row wrap" style={{ gap: 6 }}>
            <span className="tag">{material.category}</span>
            {material.isRequired !== false ? <span className="tag gr">Wajib</span> : null}
          </span>
          {locked ? (
            <span className="tag">
              <Icon name="lock" size={12} />
              Terkunci
            </span>
          ) : (
            <MaterialStatusTag status={progress.status} />
          )}
        </div>
        <h3 className="mt" style={{ fontSize: 16 }}>
          {material.title}
        </h3>
        <p className="sm muted mt1" style={{ flex: 1 }}>
          {material.description}
        </p>
        <ContributorCredit contributor={material.contributor} className="mt1" />
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
    </div>
  );
}
