'use client';

import { GateScreen } from '@/components/layout/GateScreen';
import { createSupabaseRepository } from '@/lib/data/supabase-repository';
import { getSupabaseClient } from '@/lib/supabase/client';
import type {
  AcademySnapshot,
  ActivityType,
  AssessmentAttempt,
  CollectionItem,
  ContentCollectionKey,
  MaterialQuizQuestion,
  MaterialStatus,
  ProgressState,
  QuizAttempt,
} from '@/lib/types';
import { LEARNING_CONFIG } from '@/lib/learning';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { APPEND_COLLECTIONS, sortCollections } from '@/lib/data/collections';
import { createSeedSnapshot } from '@/lib/data/seed';
import { useAuth } from './AuthProvider';
import { useToast } from './ToastProvider';

interface DataContextValue {
  snapshot: AcademySnapshot;
  hydrated: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  upsertContent: <K extends ContentCollectionKey>(
    key: K,
    item: CollectionItem<K>,
  ) => Promise<void>;
  deleteContent: (key: ContentCollectionKey, id: string) => Promise<void>;
  setMaterialProgress: (id: string, status: MaterialStatus, progress: number) => Promise<void>;
  toggleMaterialDone: (id: string) => Promise<void>;
  setGuideDone: (id: string, done: boolean) => Promise<void>;
  markProblemSeen: (id: string) => Promise<void>;
  markFlowSeen: (id: string) => Promise<void>;
  setVisitedProducts: () => Promise<void>;
  logActivity: (type: ActivityType, title: string, score: number | null, refId?: string) => Promise<void>;
  saveAttempt: (attempt: AssessmentAttempt) => Promise<void>;
  /** Simpan hasil kuis materi; lulus di atas passMark otomatis menandai materi selesai. */
  saveQuizAttempt: (
    materialId: string,
    score: number,
    answers: Record<string, number>,
  ) => Promise<void>;
  /** Simpan soal kuis materi (tambah/ubah) — hanya owner (RLS). */
  saveQuizQuestion: (question: MaterialQuizQuestion) => Promise<void>;
  /** Hapus satu soal kuis materi — hanya owner (RLS). */
  deleteQuizQuestion: (materialId: string, id: string) => Promise<void>;
  setPassMark: (value: number) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

const progressErrorMessage = 'Gagal menyimpan progres ke Supabase.';

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<AcademySnapshot>(() => createSeedSnapshot());
  const snapshotRef = useRef(snapshot);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const userId = user?.id;
  const repository = useMemo(() => {
    const client = getSupabaseClient();
    if (!client || !userId) return null;
    return createSupabaseRepository(client, userId);
  }, [userId]);

  const requireRepository = useCallback(() => {
    if (!repository) throw new Error('Sesi Supabase belum siap. Muat ulang halaman.');
    return repository;
  }, [repository]);

  const apply = useCallback((next: AcademySnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await requireRepository().load();
      apply(data);
      setError(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Gagal memuat data academy.';
      setError(message);
      showToast(message, 'err');
    } finally {
      setHydrated(true);
    }
  }, [apply, requireRepository, showToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const commitProgress = useCallback(
    async (next: ProgressState) => {
      const previous = snapshotRef.current;
      apply({ ...previous, progress: next });
      try {
        await requireRepository().saveProgress(next);
      } catch {
        apply(previous);
        showToast(progressErrorMessage, 'err');
      }
    },
    [apply, requireRepository, showToast],
  );

  const setMaterialProgress = useCallback(
    async (id: string, status: MaterialStatus, progress: number) => {
      if (!hydrated) return;
      const current = snapshotRef.current.progress;
      const next: ProgressState = {
        ...current,
        materials: {
          ...current.materials,
          [id]: {
            status,
            progress: Math.max(0, Math.min(100, Math.round(progress))),
            updatedAt: Date.now(),
          },
        },
      };
      await commitProgress(next);
    },
    [commitProgress, hydrated],
  );

  const logActivity = useCallback(
    async (type: ActivityType, title: string, score: number | null, refId = '') => {
      if (!hydrated) return;
      const previous = snapshotRef.current;
      const item = {
        id: `h_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        type,
        title,
        score: score == null ? null : Math.round(score),
        refId,
        createdAt: Date.now(),
      };
      const nextActivity = [item, ...previous.activity].slice(0, 200);
      apply({ ...previous, activity: nextActivity });
      try {
        await requireRepository().saveActivity(nextActivity);
      } catch {
        apply(previous);
        showToast(progressErrorMessage, 'err');
      }
    },
    [apply, hydrated, requireRepository, showToast],
  );

  const toggleMaterialDone = useCallback(
    async (id: string) => {
      if (!hydrated) return;
      const current = snapshotRef.current.progress.materials[id];
      const isDone = current?.status === 'done';
      await setMaterialProgress(
        id,
        isDone ? 'progress' : 'done',
        isDone ? LEARNING_CONFIG.openedProgress : LEARNING_CONFIG.doneProgress,
      );
      if (isDone) {
        showToast('Materi ditandai belum selesai');
      } else {
        const material = snapshotRef.current.content.materials.find((entry) => entry.id === id);
        await logActivity('material', `Menyelesaikan materi: ${material?.title ?? ''}`, null, id);
        showToast('Materi ditandai selesai ✓');
      }
    },
    [hydrated, logActivity, setMaterialProgress, showToast],
  );

  const setGuideDone = useCallback(
    async (id: string, done: boolean) => {
      if (!hydrated) return;
      const current = snapshotRef.current.progress;
      const guides = { ...current.guides };
      if (done) guides[id] = true;
      else delete guides[id];
      await commitProgress({ ...current, guides });
    },
    [commitProgress, hydrated],
  );

  const markProblemSeen = useCallback(
    async (id: string) => {
      if (!hydrated) return;
      const current = snapshotRef.current.progress;
      if (current.problems[id]) return;
      await commitProgress({ ...current, problems: { ...current.problems, [id]: true } });
    },
    [commitProgress, hydrated],
  );

  const markFlowSeen = useCallback(
    async (id: string) => {
      if (!hydrated) return;
      const current = snapshotRef.current.progress;
      if (current.flow[id]) return;
      await commitProgress({ ...current, flow: { ...current.flow, [id]: true } });
    },
    [commitProgress, hydrated],
  );

  const setVisitedProducts = useCallback(async () => {
    if (!hydrated) return;
    const current = snapshotRef.current.progress;
    if (current.visitedProducts) return;
    await commitProgress({ ...current, visitedProducts: true });
  }, [commitProgress, hydrated]);

  const saveAttempt = useCallback(
    async (attempt: AssessmentAttempt) => {
      if (!hydrated) return;
      const previous = snapshotRef.current;
      const nextAttempts = [attempt, ...previous.attempts];
      apply({ ...previous, attempts: nextAttempts });
      try {
        await requireRepository().saveAttempts(nextAttempts);
      } catch {
        apply(previous);
        showToast(progressErrorMessage, 'err');
      }
    },
    [apply, hydrated, requireRepository, showToast],
  );

  const saveQuizAttempt = useCallback(
    async (materialId: string, score: number, answers: Record<string, number>) => {
      if (!hydrated) return;
      const previous = snapshotRef.current;
      const attempt: QuizAttempt = {
        id: `qa_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        materialId,
        score: Math.max(0, Math.min(100, Math.round(score))),
        answers,
        createdAt: Date.now(),
      };
      apply({ ...previous, quizAttempts: [attempt, ...previous.quizAttempts] });
      try {
        await requireRepository().saveQuizAttempt(attempt);
      } catch {
        apply(previous);
        showToast(progressErrorMessage, 'err');
        return;
      }

      const status = snapshotRef.current.progress.materials[materialId]?.status ?? 'todo';
      if (attempt.score >= LEARNING_CONFIG.passMark) {
        if (status !== 'done') {
          await setMaterialProgress(materialId, 'done', LEARNING_CONFIG.doneProgress);
          const material = snapshotRef.current.content.materials.find(
            (item) => item.id === materialId,
          );
          await logActivity(
            'material',
            `Lulus kuis: ${material?.title ?? ''}`,
            attempt.score,
            materialId,
          );
        }
      } else if (status === 'todo') {
        await setMaterialProgress(materialId, 'progress', LEARNING_CONFIG.openedProgress);
      }
    },
    [apply, hydrated, logActivity, requireRepository, setMaterialProgress, showToast],
  );

  const saveQuizQuestion = useCallback(
    async (question: MaterialQuizQuestion) => {
      await requireRepository().saveQuizQuestion(question);
      const current = snapshotRef.current;
      const list = [...(current.materialQuizzes[question.materialId] ?? [])];
      const index = list.findIndex((entry) => entry.id === question.id);
      if (index >= 0) list[index] = question;
      else list.push(question);
      list.sort((a, b) => a.sortOrder - b.sortOrder);
      apply({
        ...current,
        materialQuizzes: { ...current.materialQuizzes, [question.materialId]: list },
      });
    },
    [apply, requireRepository],
  );

  const deleteQuizQuestion = useCallback(
    async (materialId: string, id: string) => {
      await requireRepository().deleteQuizQuestion(id);
      const current = snapshotRef.current;
      const list = (current.materialQuizzes[materialId] ?? []).filter((entry) => entry.id !== id);
      apply({
        ...current,
        materialQuizzes: { ...current.materialQuizzes, [materialId]: list },
      });
    },
    [apply, requireRepository],
  );

  const setPassMark = useCallback(
    async (value: number) => {
      if (!hydrated) return;
      if (!Number.isFinite(value) || value < 1 || value > 100) {
        showToast('Batas lulus harus 1–100', 'err');
        return;
      }
      const previous = snapshotRef.current;
      const nextSettings = { ...previous.settings, passMark: Math.round(value) };
      apply({ ...previous, settings: nextSettings });
      try {
        await requireRepository().saveSettings(nextSettings);
        showToast(`Batas lulus disimpan: ${nextSettings.passMark}`);
      } catch {
        apply(previous);
        showToast(progressErrorMessage, 'err');
      }
    },
    [apply, hydrated, requireRepository, showToast],
  );

  const upsertContent = useCallback(
    async <K extends ContentCollectionKey>(key: K, item: CollectionItem<K>) => {
      await requireRepository().upsertContent(key, item);
      const current = snapshotRef.current;
      const list = [...current.content[key]] as CollectionItem<K>[];
      const index = list.findIndex((entry) => entry.id === item.id);
      if (index >= 0) list[index] = item;
      else if (APPEND_COLLECTIONS.has(key)) list.push(item);
      else list.unshift(item);
      const content = sortCollections({
        ...current.content,
        [key]: list,
      } as AcademySnapshot['content']);
      apply({ ...current, content });
    },
    [apply, requireRepository],
  );

  const deleteContent = useCallback(
    async (key: ContentCollectionKey, id: string) => {
      await requireRepository().deleteContent(key, id);
      const current = snapshotRef.current;
      const list = (current.content[key] as { id: string }[]).filter((entry) => entry.id !== id);
      let content = {
        ...current.content,
        [key]: list,
      } as AcademySnapshot['content'];
      if (key === 'products') {
        content = {
          ...content,
          products: content.products.map((product) => ({
            ...product,
            memberIds: product.memberIds.filter((memberId) => memberId !== id),
          })),
        };
      }
      let progress = current.progress;
      if (key === 'materials') {
        const materials = { ...progress.materials };
        delete materials[id];
        progress = { ...progress, materials };
      }
      apply({ ...current, content, progress });
      if (key === 'materials') {
        await requireRepository().saveProgress(progress).catch(() => undefined);
      }
    },
    [apply, requireRepository],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      snapshot,
      hydrated,
      error,
      refresh,
      upsertContent,
      deleteContent,
      setMaterialProgress,
      toggleMaterialDone,
      setGuideDone,
      markProblemSeen,
      markFlowSeen,
      setVisitedProducts,
      logActivity,
      saveAttempt,
      saveQuizAttempt,
      saveQuizQuestion,
      deleteQuizQuestion,
      setPassMark,
    }),
    [
      snapshot,
      hydrated,
      error,
      refresh,
      upsertContent,
      deleteContent,
      setMaterialProgress,
      toggleMaterialDone,
      setGuideDone,
      markProblemSeen,
      markFlowSeen,
      setVisitedProducts,
      logActivity,
      saveAttempt,
      saveQuizAttempt,
      saveQuizQuestion,
      deleteQuizQuestion,
      setPassMark,
    ],
  );

  if (!hydrated) {
    return (
      <GateScreen
        title="Menyiapkan data…"
        subtitle="Mengambil konten academy dari Supabase."
        loading
      />
    );
  }

  if (error) {
    return (
      <GateScreen
        title="Gagal memuat data"
        subtitle={error}
        action={
          <button
            className="btn p"
            onClick={() => {
              setHydrated(false);
              setError(null);
              void refresh();
            }}
          >
            Coba lagi
          </button>
        }
      />
    );
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used inside DataProvider');
  return context;
}
