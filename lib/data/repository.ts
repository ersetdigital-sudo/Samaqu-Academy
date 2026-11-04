import type {
  AcademySnapshot,
  ActivityItem,
  AssessmentAttempt,
  AssessmentSettings,
  ContentCollectionKey,
  CollectionItem,
  ProgressState,
} from '@/lib/types';

export interface AcademyRepository {
  load(): Promise<AcademySnapshot>;
  upsertContent<K extends ContentCollectionKey>(
    key: K,
    item: CollectionItem<K>,
  ): Promise<void>;
  deleteContent(key: ContentCollectionKey, id: string): Promise<void>;
  saveProgress(progress: ProgressState): Promise<void>;
  saveActivity(items: ActivityItem[]): Promise<void>;
  saveAttempts(items: AssessmentAttempt[]): Promise<void>;
  saveSettings(settings: AssessmentSettings): Promise<void>;
}
