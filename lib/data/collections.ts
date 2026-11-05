import type { ContentCollections, ContentCollectionKey } from '@/lib/types';

export const APPEND_COLLECTIONS = new Set<ContentCollectionKey>([
  'materials',
  'flow',
  'guides',
  'problems',
  'scenarios',
  'quiz',
  'jobdesk',
  'sops',
]);

export function sortCollections(content: ContentCollections): ContentCollections {
  return {
    ...content,
    materials: [...content.materials].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.updatedAt ?? 0) - (b.updatedAt ?? 0),
    ),
    flow: [...content.flow].sort((a, b) => a.no - b.no),
    guides: [...content.guides].sort((a, b) => a.no - b.no),
  };
}
