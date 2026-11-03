'use client';

import { AppLink as Link } from '@/components/ui/AppLink';
import { useData } from '@/components/providers/DataProvider';
import { Icon } from '@/components/ui/Icon';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { ACTIVITY_ICONS } from '@/lib/constants';
import { MaterialCard } from '@/features/learning/MaterialCard';
import { bestScore, materialStats } from '@/lib/stats';
import {
  TRAINING_STAGES,
  buildTrainingContext,
  getNextStep,
  getStageProgress,
  getTrainingProgress,
} from '@/lib/training';
import { formatDate, scoreTagClass } from '@/lib/utils/format';
import type { ReactNode } from 'react';

const QUICK_LINKS = [
  { label: 'Cari Script Chat', icon: 'message-square-text', href: '/scripts' },
  { label: 'Product Knowledge', icon: 'shirt', href: '/products' },
  { label: 'Latihan Chat Scenario', icon: 'messages-square', href: '/simulator' },
  { label: 'Review Percakapan', icon: 'scan-search', href: '/reviewer' },
  { label: 'Problem Solving', icon: 'life-buoy', href: '/problems' },
  { label: 'Communication Guidelines', icon: 'book-heart', href: '/guidelines' },
];

export function OverviewView() {
  const { snapshot } = useData();
  const context = buildTrainingContext(snapshot);
  const stats = materialStats(snapshot.content.materials, snapshot.progress);
  const trainingPct = getTrainingProgress(context);
  const best = bestScore(snapshot.attempts);
  const next = getNextStep(context);
  const stages = TRAINING_STAGES.map((stage) => ({
    stage,
    progress: getStageProgress(stage, context),
  }));
  const completedStages = stages.filter((entry) => entry.progress.pct === 100).length;
  const continueMaterials = snapshot.content.materials.filter(
    (material) => snapshot.progress.materials[material.id]?.status === 'progress',
  );
  const recommended = snapshot.content.materials
    .filter((material) => (snapshot.progress.materials[material.id]?.status ?? 'todo') === 'todo')
    .slice(0, 3);

  const statCards: { label: string; value: ReactNode; icon: string; helper: ReactNode }[] = [
    { label: 'Total Materi', value: stats.total, icon: 'book-open', helper: 'Di Learning Center' },
    {
      label: 'Materi Selesai',
      value: stats.done,
      icon: 'check-circle-2',
      helper: `${stats.total - stats.done} materi tersisa`,
    },
    {
      label: 'Progress Belajar',
      value: `${stats.pct}%`,
      icon: 'trending-up',
      helper: <ProgressBar value={stats.pct} className="mt1" />,
    },
    {
      label: 'Nilai Assessment',
      value: best ?? '—',
      icon: 'award',
      helper: `Batas lulus: ${snapshot.settings.passMark}`,
    },
  ];

  return (
    <>
      <div className="card hero">
        <div>
          <div className="eyebrow">Dashboard</div>
          <h1>Selamat datang kembali, Admin! 👋</h1>
          <p className="lead mt1">
            Terus tingkatkan kemampuanmu dalam memberikan pelayanan terbaik kepada customer Samaqu.
          </p>
          <div className="row wrap mt">
            <Link className="btn p" href={next.href}>
              <Icon name="play" />
              {next.label}
            </Link>
            <Link className="btn" href="/training">
              <Icon name="route" />
              Lihat Training Path
            </Link>
          </div>
        </div>
        <div className="row" style={{ gap: 16 }}>
          <ScoreRing value={trainingPct} label="Training" />
          <div className="sm">
            <b>Progress training</b>
            <div className="muted">
              {completedStages} dari {stages.length} tahap selesai
            </div>
          </div>
        </div>
      </div>

      <div className="grid g4 mt">
        {statCards.map((card) => (
          <div className="card stat" key={card.label}>
            <div className="l">
              {card.label}
              <span className="sic">
                <Icon name={card.icon} />
              </span>
            </div>
            <div className="v">{card.value}</div>
            <div className="h">{card.helper}</div>
          </div>
        ))}
      </div>

      <div className="split mt">
        <div className="card">
          <div className="row sp">
            <h2>Lanjutkan Belajar</h2>
            <Link className="btn sm ghost" href="/learning">
              Semua materi
              <Icon name="arrow-right" />
            </Link>
          </div>
          <div className="mt1">
            {continueMaterials.length ? (
              continueMaterials.map((material) => {
                const progress = snapshot.progress.materials[material.id];
                return (
                  <Link
                    key={material.id}
                    href={`/learning?id=${encodeURIComponent(material.id)}`}
                    className="li ck"
                    style={{
                      borderRadius: 10,
                      padding: '12px 8px',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <span className="sic acc">
                      <Icon name="play" />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{material.title}</b>
                      <div className="xs muted">
                        {material.category} · {material.durationMinutes} menit
                      </div>
                      <ProgressBar value={progress?.progress ?? 0} className="mt1" />
                    </div>
                    <b className="sm">{progress?.progress ?? 0}%</b>
                  </Link>
                );
              })
            ) : (
              <p className="sm muted mt">
                Tidak ada materi yang sedang dipelajari. Mulai dari rekomendasi di bawah.
              </p>
            )}
          </div>
          <h2 className="mt2">Training Path</h2>
          <div className="mt1">
            {stages.map(({ stage, progress }, index) => (
              <Link
                key={stage.id}
                href="/training"
                className="li ck"
                style={{
                  padding: '10px 8px',
                  borderRadius: 10,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span
                  className={`tdot ${progress.pct === 100 ? 'done' : progress.pct > 0 ? 'run' : ''}`}
                  style={{ width: 28, height: 28, fontSize: 12 }}
                >
                  {progress.pct === 100 ? <Icon name="check" size={14} /> : index + 1}
                </span>
                <span className="sm" style={{ flex: 1, fontWeight: 500 }}>
                  {stage.title}
                </span>
                <ProgressBar value={progress.pct} style={{ width: 90 }} />
                <span className="xs muted" style={{ width: 34, textAlign: 'right' }}>
                  {progress.pct}%
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Akses Cepat</h2>
          <div className="grid g2 mt" style={{ gap: 10 }}>
            {QUICK_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="card flat ck"
                style={{ padding: 14, textDecoration: 'none', color: 'inherit' }}
              >
                <span className="sic">
                  <Icon name={item.icon} />
                </span>
                <b className="sm" style={{ display: 'block', marginTop: 10, lineHeight: 1.35 }}>
                  {item.label}
                </b>
              </Link>
            ))}
          </div>
          <h2 className="mt2">Aktivitas Terakhir</h2>
          <div className="mt1">
            {snapshot.activity.slice(0, 4).map((item) => (
              <div className="li sm" key={item.id}>
                <span className="sic" style={{ width: 28, height: 28 }}>
                  <Icon
                    name={ACTIVITY_ICONS[item.type] ?? 'activity'}
                    size={14}
                  />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {item.title}
                  </div>
                  <div className="xs muted">{formatDate(item.createdAt)}</div>
                </div>
                {item.score != null ? (
                  <span className={`tag ${scoreTagClass(item.score)}`}>{item.score}</span>
                ) : null}
              </div>
            ))}
            {snapshot.activity.length ? null : <p className="sm muted">Belum ada aktivitas.</p>}
          </div>
        </div>
      </div>

      <div className="mt">
        <div className="row sp">
          <div>
            <h2>Rekomendasi Untukmu</h2>
            <p className="sm muted">Berdasarkan progress belajarmu saat ini</p>
          </div>
        </div>
        <div className="grid g3 mt">
          {recommended.length ? (
            recommended.map((material) => (
              <MaterialCard
                key={material.id}
                material={material}
                progress={
                  snapshot.progress.materials[material.id] ?? {
                    status: 'todo',
                    progress: 0,
                    updatedAt: 0,
                  }
                }
                hideOwnerActions
              />
            ))
          ) : (
            <div className="card flat" style={{ gridColumn: '1/-1' }}>
              <p className="sm muted">
                Semua materi sudah dimulai. Lanjutkan ke Chat Scenario untuk latihan praktik.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
