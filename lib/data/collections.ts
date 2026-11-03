import type { ContentCollections, ContentCollectionKey } from '@/lib/types';

export const APPEND_COLLECTIONS = new Set<ContentCollectionKey>([
  'materials',
  'flow',
  'guides',
  'problems',
  'scenarios',
  'quiz',
]);

export function sortCollections(content: ContentCollections): ContentCollections {
  return {
    ...content,
    flow: [...content.flow].sort((a, b) => a.no - b.no),
    guides: [...content.guides].sort((a, b) => a.no - b.no),
  };
}
