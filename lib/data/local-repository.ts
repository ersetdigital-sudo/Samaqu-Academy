import { LEGACY_KEYS, STORAGE_KEYS } from '@/lib/constants';
import { APPEND_COLLECTIONS, sortCollections } from './collections';
import type {
  AcademySnapshot,
  ActivityItem,
  AssessmentAttempt,
  AssessmentSettings,
  ContentCollections,
  ContentCollectionKey,
  CollectionItem,
  ProgressState,
} from '@/lib/types';
import { createSeedSnapshot } from './seed';
import { safeStorage } from './storage';
import {
  normalizeActivity,
  normalizeAttempts,
  normalizeContent,
  normalizeProgress,
  normalizeSettings,
} from './legacy-normalize';
import { loadImageUrls, removeImageBlob, saveImageBlob } from './image-store';
import type { AcademyRepository } from './repository';

function persist(key: string, value: unknown): void {
  if (!safeStorage.setJSON(key, value)) {
    throw new Error('Penyimpanan browser penuh. Hapus sebagian data lalu coba lagi.');
  }
}

function isContent(value: unknown): value is ContentCollections {
  if (!value || typeof value !== 'object') return false;
  const content = value as Record<string, unknown>;
  return [
    'materials',
    'scripts',
    'cases',
    'beforeAfter',
    'flow',
    'guides',
    'problems',
    'scenarios',
    'quiz',
    'products',
  ].every((key) => Array.isArray(content[key]));
}

function readLegacyContent(seed: ContentCollections): ContentCollections | null {
  const materials = safeStorage.getJSON<any[]>(LEGACY_KEYS.materials);
  const scripts =
    safeStorage.getJSON<any[]>(LEGACY_KEYS.scripts) ??
    safeStorage.getJSON<any[]>(LEGACY_KEYS.legacyScripts);
  const cases =
    safeStorage.getJSON<any[]>(LEGACY_KEYS.cases) ??
    safeStorage.getJSON<any[]>(LEGACY_KEYS.legacyCases);
  const beforeAfter = safeStorage.getJSON<any[]>(LEGACY_KEYS.beforeAfter);
  const flow = safeStorage.getJSON<any[]>(LEGACY_KEYS.flow);
  const guides = safeStorage.getJSON<any[]>(LEGACY_KEYS.guides);
  const problems = safeStorage.getJSON<any[]>(LEGACY_KEYS.problems);
  const scenarios = safeStorage.getJSON<any[]>(LEGACY_KEYS.scenarios);
  const quiz = safeStorage.getJSON<any[]>(LEGACY_KEYS.quiz);
  const products = safeStorage.getJSON<any[]>(LEGACY_KEYS.products);

  const hasAny = [
    materials,
    scripts,
    cases,
    beforeAfter,
    flow,
    guides,
    problems,
    scenarios,
    quiz,
    products,
  ].some((value) => value !== null);

  if (!hasAny) return null;

  return normalizeContent({
    materials: materials ?? seed.materials,
    scripts: scripts ?? seed.scripts,
    cases: cases ?? seed.cases,
    beforeAfter: beforeAfter ?? seed.beforeAfter,
    flow: flow ?? seed.flow,
    guides: guides ?? seed.guides,
    problems: problems ?? seed.problems,
    scenarios: scenarios ?? seed.scenarios,
    quiz: quiz ?? seed.quiz,
    products: products ?? seed.products,
  });
}

function loadContent(seed: ContentCollections): ContentCollections {
  const stored = safeStorage.getJSON<unknown>(STORAGE_KEYS.content);
  if (isContent(stored)) return sortCollections(stored);

  const migrated = readLegacyContent(seed);
  if (migrated) {
    const sorted = sortCollections(migrated);
    persist(STORAGE_KEYS.content, sorted);
    return sorted;
  }

  const seeded = sortCollections(createSeedSnapshot().content);
  persist(STORAGE_KEYS.content, seeded);
  return seeded;
}

function readWithLegacy<T>(key: string, legacyKey: string, fallback: T): T {
  const stored = safeStorage.getJSON<T>(key);
  if (stored !== null) return stored;
  const legacy = safeStorage.getJSON<T>(legacyKey);
  if (legacy !== null) return legacy;
  return fallback;
}

function loadProgress(seed: ProgressState): ProgressState {
  const progress = normalizeProgress(
    readWithLegacy<unknown>(STORAGE_KEYS.progress, LEGACY_KEYS.progress, seed),
  );
  persist(STORAGE_KEYS.progress, progress);
  return progress;
}

function loadActivity(seed: ActivityItem[]): ActivityItem[] {
  const activity = normalizeActivity(
    readWithLegacy<unknown[]>(STORAGE_KEYS.activity, LEGACY_KEYS.activity, seed),
  );
  persist(STORAGE_KEYS.activity, activity);
  return activity;
}

function loadAttempts(): AssessmentAttempt[] {
  const attempts = normalizeAttempts(
    readWithLegacy<unknown[]>(STORAGE_KEYS.attempts, LEGACY_KEYS.attempts, []),
  );
  persist(STORAGE_KEYS.attempts, attempts);
  return attempts;
}

function loadSettings(seed: AssessmentSettings): AssessmentSettings {
  const settings = normalizeSettings(
    readWithLegacy<unknown>(STORAGE_KEYS.settings, LEGACY_KEYS.settings, seed),
  );
  persist(STORAGE_KEYS.settings, settings);
  return settings;
}

export const localRepository: AcademyRepository = {
  async load(): Promise<AcademySnapshot> {
    const seed = createSeedSnapshot();
    const content = loadContent(seed.content);
    const progress = loadProgress(seed.progress);
    const activity = loadActivity(seed.activity);
    const attempts = loadAttempts();
    const settings = loadSettings(seed.settings);
    const images = await loadImageUrls();
    return { content, progress, activity, attempts, settings, images };
  },

  async upsertContent<K extends ContentCollectionKey>(
    key: K,
    item: CollectionItem<K>,
  ): Promise<void> {
    const seed = createSeedSnapshot();
    const content = loadContent(seed.content);
    const list = content[key] as CollectionItem<K>[];
    const index = list.findIndex((entry) => entry.id === item.id);
    if (index >= 0) list[index] = item;
    else if (APPEND_COLLECTIONS.has(key)) list.push(item);
    else list.unshift(item);
    persist(STORAGE_KEYS.content, sortCollections(content));
  },

  async deleteContent(key: ContentCollectionKey, id: string): Promise<void> {
    const seed = createSeedSnapshot();
    const content = loadContent(seed.content);
    const list = content[key] as { id: string }[];
    const index = list.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    list.splice(index, 1);
    if (key === 'products') {
      content.products = content.products.map((product) => ({
        ...product,
        memberIds: product.memberIds.filter((memberId) => memberId !== id),
      }));
      await removeImageBlob(id).catch(() => undefined);
    }
    persist(STORAGE_KEYS.content, sortCollections(content));
  },

  async saveProgress(progress: ProgressState): Promise<void> {
    persist(STORAGE_KEYS.progress, progress);
  },

  async saveActivity(items: ActivityItem[]): Promise<void> {
    persist(STORAGE_KEYS.activity, items.slice(0, 200));
  },

  async saveAttempts(items: AssessmentAttempt[]): Promise<void> {
    persist(STORAGE_KEYS.attempts, items);
  },

  async saveSettings(settings: AssessmentSettings): Promise<void> {
    persist(STORAGE_KEYS.settings, settings);
  },

  async saveImage(productId: string, blob: Blob): Promise<string> {
    return saveImageBlob(productId, blob);
  },

  async deleteImage(productId: string): Promise<void> {
    await removeImageBlob(productId);
  },
};
