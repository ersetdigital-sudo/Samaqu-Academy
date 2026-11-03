'use client';

import { AppLink as Link } from '@/components/ui/AppLink';
import { useData } from '@/components/providers/DataProvider';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { bestScore, materialStats } from '@/lib/stats';
import {
  TRAINING_STAGES,
  buildTrainingContext,
  getNextStep,
  getStageProgress,
  getTrainingProgress,
} from '@/lib/training';
import { formatDate, scoreTagClass } from '@/lib/utils/format';

export function ProgressView() {
  const { snapshot } = useData();
  const stats = materialStats(snapshot.content.materials, snapshot.progress);
  const context = buildTrainingContext(snapshot);
  const trainingPct = getTrainingProgress(context);
  const completedStages = TRAINING_STAGES.filter(
    (stage) => getStageProgress(stage, context).pct === 100,
  ).length;
  const best = bestScore(snapshot.attempts);
  const next = getNextStep(context);
  const doneMaterials = snapshot.content.materials.filter(
    (material) => snapshot.progress.materials[material.id]?.status === 'done',
  );
  const remainingMaterials = snapshot.content.materials.filter(
    (material) => snapshot.progress.materials[material.id]?.status !== 'done',
  );
  const practiceHistory = snapshot.activity
    .filter((item) => item.type === 'scenario' || item.type === 'review')
    .slice(0, 8);

  return (
    <>
      <PageHeader
        eyebrow="Development"
        title="My Learning Progress"
        subtitle="Pantau perkembangan belajarmu dan lihat apa yang perlu dipelajari selanjutnya."
        actions={
          <Link className="btn" href="/training?tab=results">
            <Icon name="award" />
            Results &amp; Certification
          </Link>
        }
      />

      <div className="grid g3">
        <div className="card row" style={{ gap: 18 }}>
          <ScoreRing value={stats.pct} label="Materi" />
          <div>
            <h3>Penyelesaian Materi</h3>
            <p className="sm muted">
              {stats.done} dari {stats.total} materi
            </p>
          </div>
        </div>
        <div className="card row" style={{ gap: 18 }}>
          <ScoreRing value={trainingPct} label="Training" />
          <div>
            <h3>Training Path</h3>
            <p className="sm muted">
              {completedStages}/{TRAINING_STAGES.length} tahap
            </p>
            <Link className="btn sm mt1" href="/training">
              Lihat
            </Link>
          </div>
        </div>
        <div className="card row" style={{ gap: 18 }}>
          <ScoreRing value={best} label="Nilai" />
          <div>
            <h3>Assessment</h3>
            <p className="sm muted">
              {best == null
                ? 'Belum dikerjakan'
                : `${best >= snapshot.settings.passMark ? 'Lulus' : 'Belum lulus'} · batas ${snapshot.settings.passMark}`}
            </p>
            <Link className="btn sm mt1" href="/training?tab=assessment">
              {best == null ? 'Kerjakan' : 'Ulangi'}
            </Link>
          </div>
        </div>
      </div>

      <div className="grid g2 mt">
        <div className="card">
          <h3>Materi Selesai ({doneMaterials.length})</h3>
          {doneMaterials.length ? (
            doneMaterials.map((material) => (
              <Link
                className="li sm ck"
                href={`/learning?id=${encodeURIComponent(material.id)}`}
                key={material.id}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <Icon name="check-circle-2" size={16} style={{ color: 'var(--acc)' }} />
                <span style={{ flex: 1 }}>{material.title}</span>
                <span className="xs muted">{material.category}</span>
              </Link>
            ))
          ) : (
            <p className="sm muted mt1">Belum ada.</p>
          )}
        </div>
        <div className="card">
          <h3>Belum Selesai ({remainingMaterials.length})</h3>
          {remainingMaterials.length ? (
            remainingMaterials.map((material) => {
              const progress = snapshot.progress.materials[material.id]?.progress ?? 0;
              return (
                <Link
                  className="li ck sm"
                  href={`/learning?id=${encodeURIComponent(material.id)}`}
                  key={material.id}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <span style={{ flex: 1 }}>{material.title}</span>
                  <ProgressBar value={progress} style={{ width: 80 }} />
                  <span className="xs muted" style={{ width: 34, textAlign: 'right' }}>
                    {progress}%
                  </span>
                </Link>
              );
            })
          ) : (
            <p className="sm muted mt1">Semua materi selesai 🎉</p>
          )}
        </div>
      </div>

      <div className="grid g2 mt">
        <div className="card">
          <h3>Riwayat Latihan</h3>
          <div className="tw">
            <table className="mt1">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Latihan</th>
                  <th>Skor</th>
                </tr>
              </thead>
              <tbody>
                {practiceHistory.map((item) => (
                  <tr key={item.id}>
                    <td className="xs" style={{ whiteSpace: 'nowrap' }}>
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="sm">{item.title}</td>
                    <td>
                      {item.score != null ? (
                        <span className={`tag ${scoreTagClass(item.score)}`}>{item.score}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {practiceHistory.length ? null : <p className="sm muted">Belum ada latihan.</p>}
        </div>
        <div className="card">
          <h3>Rekomendasi Selanjutnya</h3>
          <Link className="ref" href={next.href}>
            <Icon name="play" />
            <span style={{ flex: 1 }}>
              {next.label}
              <span className="xs muted" style={{ display: 'block' }}>
                Langkah berikutnya di Training Path
              </span>
            </span>
            <Icon name="chevron-right" />
          </Link>
          {remainingMaterials.slice(0, 3).map((material) => (
            <Link
              className="ref"
              href={`/learning?id=${encodeURIComponent(material.id)}`}
              key={material.id}
            >
              <Icon name="book-open" />
              <span style={{ flex: 1 }}>{material.title}</span>
              <Icon name="chevron-right" />
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
