import { getSupabaseClient } from '@/lib/supabase/client';

export type MemoryStatus = 'draft' | 'published' | 'archived';

export interface MemoryItem {
  id: string;
  title: string;
  category: string;
  content: string;
  source: string;
  status: MemoryStatus;
  version: number;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryInput {
  title: string;
  category: string;
  content: string;
  source: string;
  status: MemoryStatus;
}

const TABLE = 'memory_items';

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.');
  return supabase;
}

export async function fetchMemoryItems(): Promise<MemoryItem[]> {
  const { data, error } = await client()
    .from(TABLE)
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message || 'Gagal memuat memory organisasi.');
  return (data ?? []) as MemoryItem[];
}

export async function createMemory(input: MemoryInput, userId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await client()
    .from(TABLE)
    .insert({
      ...trimInput(input),
      id: `mem_${crypto.randomUUID()}`,
      version: 1,
      created_by: userId,
      approved_by: input.status === 'published' ? userId : null,
      created_at: now,
      updated_at: now,
    });
  if (error) throw new Error(error.message || 'Gagal menyimpan memory');
}

export async function updateMemory(
  id: string,
  version: number,
  input: MemoryInput,
  userId: string,
): Promise<void> {
  const { error } = await client()
    .from(TABLE)
    .update({
      ...trimInput(input),
      version: version + 1,
      approved_by: input.status === 'published' ? userId : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message || 'Gagal menyimpan memory');
}

export async function deleteMemory(id: string): Promise<void> {
  const { error } = await client().from(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

function trimInput(input: MemoryInput): MemoryInput {
  return {
    title: input.title.trim(),
    category: input.category.trim() || 'Operasional',
    content: input.content.trim(),
    source: input.source.trim(),
    status: input.status,
  };
}
