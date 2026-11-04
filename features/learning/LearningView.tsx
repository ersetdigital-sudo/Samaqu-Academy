'use client';

import { AppLink as Link } from '@/components/ui/AppLink';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useModal } from '@/components/providers/ModalProvider';
import { useRole } from '@/components/providers/RoleProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { MarkdownLite } from '@/components/ui/MarkdownLite';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ContributorCredit } from './ContributorCredit';
import { LearningLevelSection } from './LearningLevelSection';
import { MaterialStatusTag } from './MaterialCard';
import { MaterialQuiz } from './MaterialQuiz';
import { MaterialVideo } from './MaterialVideo';
import { useMaterialForm } from './useMaterialForm';
import { MATERIAL_CATEGORIES } from '@/lib/constants';
import {
  LEARNING_CONFIG,
  groupMaterialsByLevel,
  quizBestScore,
  quizFor,
} from '@/lib/learning';
import { materialStats } from '@/lib/stats';
import type { Material } from '@/lib/types';

type MaterialStatusFilter = 'Semua' | 'todo' | 'progress' | 'done';

export function LearningView() {
  const searchParams = useSearchParams();
  const materialId = searchParams.get('id');
  return materialId ? <MaterialDetailView id={materialId} /> : <LearningListView />;
}

function LearningListView() {
  const { snapshot, deleteContent } = useData();
  const { canManage } = useRole();
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();
  const { openMaterialForm } = useMaterialForm();
  const [category, setCategory] = useState('Semua');
  const [status, setStatus] = useState<MaterialStatusFilter>('Semua');
  const [query, setQuery] = useState('');

  const stats = materialStats(snapshot.content.materials, snapshot.progress);
  const filtering = category !== 'Semua' || status !== 'Semua' || query.trim() !== '';

  // Level, progres, dan status kunci dihitung dari seluruh materi — bukan hasil filter.
  // Owner/leader tidak terkena kunci level: semua level langsung terbuka.
  const allGroups = useMemo(
    () =>
      groupMaterialsByLevel(snapshot.levels, snapshot.content.materials, snapshot.progress, {
        lockLevels: canManage ? false : LEARNING_CONFIG.lockLevels,
      }),
    [canManage, snapshot.content.materials, snapshot.levels, snapshot.progress],
  );

  const groups = useMemo(() => {
    const search = query.trim().toLowerCase();
    const matches = (material: Material) => {
      const materialStatus = snapshot.progress.materials[material.id]?.status ?? 'todo';
      if (category !== 'Semua' && material.category !== category) return false;
      if (status !== 'Semua' && materialStatus !== status) return false;
      if (!search) return true;
      return [material.title, material.description, material.category, material.body]
        .join(' ')
        .toLowerCase()
        .includes(search);
    };
    const filtered = allGroups.map((group) => ({
      ...group,
      materials: group.materials.filter(matches),
    }));
    return filtering ? filtered.filter((group) => group.materials.length > 0) : filtered;
  }, [allGroups, category, filtering, query, snapshot.progress.materials, status]);

  const visibleCount = groups.reduce((sum, group) => sum + group.materials.length, 0);

  // Nomor urut belajar mengikuti urutan penuh, bukan hasil filter.
  const orderOf = useMemo(
    () => new Map(snapshot.content.materials.map((material, index) => [material.id, index + 1])),
    [snapshot.content.materials],
  );

  const progressOf = (id: string) =>
    snapshot.progress.materials[id] ?? { status: 'todo' as const, progress: 0, updatedAt: 0 };

  const confirmDelete = (material: Material) => {
    openModal(
      <ConfirmDialog
        title="Hapus materi ini?"
        message={`"${material.title}" akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
        onCancel={closeModal}
        onConfirm={async () => {
          await deleteContent('materials', material.id);
          closeModal();
          showToast('Materi berhasil dihapus');
        }}
      />,
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Learning & Service"
        title="Learning Center"
        subtitle="Jalur belajar Customer Service Samaqu. Selesaikan materi wajib per level untuk membuka level berikutnya."
        actions={
          <>
            <span className="tag gr">
              {stats.done}/{stats.total} selesai
            </span>
            {canManage ? (
              <Link className="btn" href="/learning/quiz-review">
                <Icon name="clipboard-list" />
                Review Kuis
              </Link>
            ) : null}
            {canManage ? (
              <button
                className="btn p"
                onClick={() =>
                  openMaterialForm(undefined, {
                    category: category !== 'Semua' ? category : MATERIAL_CATEGORIES[0],
                  })
                }
              >
                <Icon name="plus" />
                Tambah Materi
              </button>
            ) : null}
          </>
        }
      />

      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input
            className="inp"
            placeholder="Cari materi…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select
          className="inp auto"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Filter kategori"
        >
          <option value="Semua">Semua kategori</option>
          {MATERIAL_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <div className="seg" aria-label="Filter status">
          {(
            [
              ['Semua', 'Semua'],
              ['todo', 'Belum'],
              ['progress', 'Sedang'],
              ['done', 'Selesai'],
            ] as [MaterialStatusFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              className={status === value ? 'on' : ''}
              onClick={() => setStatus(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visibleCount ? (
        <div className="lvl-wrap">
          {groups.map((group) => (
            <LearningLevelSection
              key={group.level.id}
              group={group}
              orderOf={orderOf}
              progressOf={progressOf}
              canManage={canManage}
              onEdit={openMaterialForm}
              onDelete={confirmDelete}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={filtering ? 'search-x' : 'book-open'}
          title={filtering ? 'Materi tidak ditemukan' : 'Belum ada materi'}
          subtitle={
            filtering
              ? 'Coba kata kunci lain atau ubah filter.'
              : 'Tambahkan materi pertama untuk Learning Center.'
          }
          action={
            canManage && !filtering ? (
              <button className="btn sm" onClick={() => openMaterialForm()}>
                <Icon name="plus" />
                Tambah Materi
              </button>
            ) : null
          }
        />
      )}
    </>
  );
}

function MaterialDetailView({ id }: { id: string }) {
  const {
    snapshot,
    hydrated,
    setMaterialProgress,
    toggleMaterialDone,
    saveQuizAttempt,
    deleteContent,
  } = useData();
  const { canManage } = useRole();
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();
  const { openMaterialForm } = useMaterialForm();
  const router = useRouter();
  const initialized = useRef<string | null>(null);

  const materials = snapshot.content.materials;
  const index = materials.findIndex((material) => material.id === id);
  const material = index >= 0 ? materials[index] : null;
  const progress = snapshot.progress.materials[id] ?? {
    status: 'todo' as const,
    progress: 0,
    updatedAt: 0,
  };

  useEffect(() => {
    if (!hydrated || !material) return;
    if (initialized.current === material.id) return;
    initialized.current = material.id;
    if (progress.status === 'todo') {
      void setMaterialProgress(material.id, 'progress', LEARNING_CONFIG.openedProgress);
    }
  }, [hydrated, material, progress.status, setMaterialProgress]);

  const questions = quizFor(snapshot.materialQuizzes, id);
  const hasQuiz = questions.length > 0;
  const bestScore = quizBestScore(snapshot.quizAttempts, id);
  const attemptCount = snapshot.quizAttempts.filter((attempt) => attempt.materialId === id).length;

  if (!material) {
    return (
      <EmptyState
        icon="book-x"
        title="Materi tidak ditemukan"
        subtitle="Materi mungkin sudah dihapus."
        action={
          <Link className="btn" href="/learning">
            <Icon name="arrow-left" />
            Kembali
          </Link>
        }
      />
    );
  }

  const previous = index > 0 ? materials[index - 1] : null;
  const next = index < materials.length - 1 ? materials[index + 1] : null;

  const confirmDelete = () => {
    openModal(
      <ConfirmDialog
        title="Hapus materi ini?"
        message={`"${material.title}" akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
        onCancel={closeModal}
        onConfirm={async () => {
          await deleteContent('materials', material.id);
          closeModal();
          showToast('Materi berhasil dihapus');
          router.push('/learning');
        }}
      />,
    );
  };

  return (
    <>
      <div className="row sp wrap">
        <Link className="btn ghost" href="/learning">
          <Icon name="arrow-left" />
          Learning Center
        </Link>
        {canManage ? (
          <div className="row">
            <button className="btn sm" onClick={() => openMaterialForm(material)}>
              <Icon name="pencil" />
              Edit
            </button>
            <button className="btn sm danger" onClick={confirmDelete}>
              <Icon name="trash-2" />
              Hapus
            </button>
          </div>
        ) : null}
      </div>

      <div className="split mt">
        <div className="card content" style={{ padding: 32 }}>
          <div className="eyebrow">{material.category}</div>
          <h1>{material.title}</h1>
          <p className="lead mt1">{material.description}</p>
          <div className="row mt sm muted wrap">
            <Icon name="clock" size={15} />
            {material.durationMinutes} menit · <MaterialStatusTag status={progress.status} />
            <ContributorCredit contributor={material.contributor} size="md" />
          </div>

          {material.objectives.length ? (
            <div className="card soft mt">
              <div className="kh">
                <Icon name="target" />
                <h3>Tujuan Pembelajaran</h3>
              </div>
              <ul className="dots">
                {material.objectives.map((objective) => (
                  <li key={objective}>
                    <Icon name="check" style={{ color: 'var(--acc)' }} />
                    {objective}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <MaterialVideo videoUrl={material.videoUrl} title={material.title} autoPlay />

          <div className="mt">
            <MarkdownLite text={material.body} />
          </div>

          <MaterialQuiz
            questions={questions}
            passMark={LEARNING_CONFIG.passMark}
            bestScore={bestScore}
            attemptCount={attemptCount}
            onSubmitted={(score, answers) => saveQuizAttempt(material.id, score, answers)}
          />

          <div
            className="row sp mt2 wrap"
            style={{ borderTop: '1px solid var(--b)', paddingTop: 18 }}
          >
            {previous ? (
              <Link
                className="btn"
                href={`/learning?id=${encodeURIComponent(previous.id)}`}
              >
                <Icon name="chevron-left" />
                Sebelumnya
              </Link>
            ) : (
              <button className="btn" disabled>
                <Icon name="chevron-left" />
                Sebelumnya
              </button>
            )}
            {hasQuiz ? (
              progress.status === 'done' ? (
                <span className="tag gr">
                  <Icon name="check" size={12} />
                  Selesai via kuis
                </span>
              ) : (
                <span className="sm muted">
                  Lulus kuis minimal {LEARNING_CONFIG.passMark}% untuk menyelesaikan materi.
                </span>
              )
            ) : (
              <button
                className={`btn ${progress.status === 'done' ? '' : 'p'}`}
                onClick={() => toggleMaterialDone(material.id)}
              >
                <Icon name={progress.status === 'done' ? 'rotate-ccw' : 'check'} />
                {progress.status === 'done' ? 'Tandai belum selesai' : 'Tandai Selesai'}
              </button>
            )}
            {next ? (
              <Link className="btn" href={`/learning?id=${encodeURIComponent(next.id)}`}>
                Berikutnya
                <Icon name="chevron-right" />
              </Link>
            ) : (
              <button className="btn" disabled>
                Berikutnya
                <Icon name="chevron-right" />
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="card">
            <div className="row sp">
              <h3>Progress materi ini</h3>
              <b>{progress.progress}%</b>
            </div>
            <ProgressBar value={progress.progress} className="mt1" />
          </div>
          <div className="card mt">
            <h3>Daftar Materi</h3>
            <div className="mt1">
              {materials.map((item) => {
                const itemStatus = snapshot.progress.materials[item.id]?.status ?? 'todo';
                return (
                  <Link
                    key={item.id}
                    href={`/learning?id=${encodeURIComponent(item.id)}`}
                    className="li ck"
                    style={{
                      padding: '9px 4px',
                      textDecoration: 'none',
                      color: 'inherit',
                      fontWeight: item.id === id ? 600 : undefined,
                    }}
                  >
                    <span style={{ width: 18 }}>
                      {itemStatus === 'done' ? (
                        <Icon name="check-circle-2" size={16} style={{ color: 'var(--acc)' }} />
                      ) : item.id === id ? (
                        <Icon name="circle-dot" size={16} />
                      ) : (
                        <Icon name="circle" size={16} style={{ color: 'var(--t3)' }} />
                      )}
                    </span>
                    <span className="sm" style={{ flex: 1 }}>
                      {item.title}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
