import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { conversationMemory } from './knowledge-conversations.ts';
import {
  sourceOf,
  toDoc,
  toMemoryDoc,
  type ContentRow,
  type KnowledgeDoc,
  type KnowledgeSource,
  type MemoryRow,
} from './knowledge-documents.ts';
import { rankDocs } from './knowledge-ranking.ts';

export type { KnowledgeSource } from './knowledge-documents.ts';

export interface AiContext {
  context: string;
  sources: KnowledgeSource[];
  knowledgeCount: number;
  memoryCount: number;
}

function knowledgeBlock(docs: KnowledgeDoc[]): string {
  let sourceNumber = 1;
  return docs
    .map((doc) => {
      const flag = doc.sample ? ' | DATA CONTOH' : '';
      const header = `[K${sourceNumber}] ${doc.source} — ${doc.title} | Kategori: ${doc.category} | Status: Published${flag} | Diperbarui: ${doc.updatedAt.slice(0, 10)}`;
      sourceNumber += 1;
      return `${header}\n${doc.content}`;
    })
    .join('\n\n');
}

function memoryBlock(docs: KnowledgeDoc[]): string {
  return docs
    .map((doc) => `[M] ${doc.title} | Kategori: ${doc.category}\n${doc.content}`)
    .join('\n\n');
}

export async function buildAiContext(
  service: SupabaseClient,
  options: {
    userId: string;
    question: string;
    conversationId?: string | null;
  },
): Promise<AiContext> {
  const [contentResult, memoryResult] = await Promise.all([
    service
      .from('content_items')
      .select('id,type,data,updated_at')
      .order('sort_order', { ascending: true }),
    service
      .from('memory_items')
      .select('id,title,category,content,source,version,updated_at')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(300),
  ]);

  const docs = ((contentResult.data ?? []) as ContentRow[])
    .map(toDoc)
    .filter(Boolean) as KnowledgeDoc[];
  const memoryDocs = ((memoryResult.data ?? []) as MemoryRow[]).map(toMemoryDoc);

  const rankedKnowledge = rankDocs(docs, options.question, 6);
  const rankedMemory = rankDocs(memoryDocs, options.question, 3);
  const oldConversations = await conversationMemory(
    service,
    options.userId,
    options.conversationId ?? null,
    options.question,
  );

  const blocks: string[] = [];
  if (rankedKnowledge.length) {
    blocks.push(
      `KNOWLEDGE RESMI SAMAQU:\n${knowledgeBlock(rankedKnowledge.map(({ doc }) => doc))}`,
    );
  }
  if (rankedMemory.length) {
    blocks.push(
      `MEMORI ORGANISASI (sudah disetujui):\n${memoryBlock(rankedMemory.map(({ doc }) => doc))}`,
    );
  }
  if (oldConversations) {
    blocks.push(`KONTEKS PERCAKAPAN LAMA:\n${oldConversations}`);
  }

  return {
    context: blocks.join('\n\n').slice(0, 12_000),
    sources: [
      ...rankedKnowledge.map(({ doc }) => sourceOf(doc)),
      ...rankedMemory.map(({ doc }) => sourceOf(doc)),
    ],
    knowledgeCount: rankedKnowledge.length,
    memoryCount: rankedMemory.length,
  };
}
