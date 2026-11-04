'use client';

import { Icon } from '@/components/ui/Icon';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { LearningLevelGroup } from '@/lib/learning';
import type { Material, MaterialProgress } from '@/lib/types';
import { MaterialCard } from './MaterialCard';

interface LearningLevelSectionProps {
  group: LearningLevelGroup;
  orderOf: Map<string, number>;
  progressOf: (id: string) => MaterialProgress;
  canManage: boolean;
  onEdit: (material: Material) => void;
  onDelete: (material: Material) => void;
}

/** Satu level jalur belajar: header level + progres, lalu kartu materinya. */
export function LearningLevelSection({
  group,
  orderOf,
  progressOf,
  canManage,
  onEdit,
  onDelete,
}: LearningLevelSectionProps) {
  const { level, materials, done, total, percent, locked } = group;

  return (
    <section className={`lvl${locked ? ' locked' : ''}`}>
      <div className="lvl-head">
        <span className="lvl-no">
          {level.id ? `Level ${level.sortOrder}` : <Icon name="book-open" size={15} />}
        </span>
        <div className="lvl-id">
          <div className="row wrap" style={{ gap: 8 }}>
            <h2 className="lvl-title">{level.title}</h2>
            {locked ? (
              <span className="tag">
                <Icon name="lock" size={12} />
                Terkunci
              </span>
            ) : null}
          </div>
          {level.description ? <p className="sm muted">{level.description}</p> : null}
        </div>
        {total ? (
          <div className="lvl-prog">
            <b>
              {done}/{total} selesai
            </b>
            <ProgressBar value={percent} />
          </div>
        ) : (
          <span className="tag">Segera hadir</span>
        )}
      </div>

      {locked ? (
        <p className="sm muted lvl-hint">
          <Icon name="lock" size={14} />
          Selesaikan semua materi wajib di level sebelumnya untuk membuka level ini.
        </p>
      ) : null}

      {materials.length ? (
        <div className="grid g3">
          {materials.map((material) => (
            <MaterialCard
              key={material.id}
              material={material}
              order={orderOf.get(material.id)}
              progress={progressOf(material.id)}
              locked={locked}
              canManage={canManage}
              onEdit={() => onEdit(material)}
              onDelete={() => onDelete(material)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
