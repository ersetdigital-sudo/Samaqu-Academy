import { FIELD_LABELS, SKIP_FIELDS, TYPE_LABELS } from './knowledge-labels.ts';

export interface KnowledgeSource {
  id: string;
  title: string;
  category: string;
  source: string;
  type: string;
  status: 'published' | 'draft' | 'archived';
  updatedAt: string;
  sample: boolean;
}

export interface KnowledgeDoc extends KnowledgeSource {
  content: string;
}

export type ContentRow = {
  id: string;
  type: string;
  data: Record<string, unknown> | null;
  updated_at: string;
};

export type MemoryRow = {
  id: string;
  title: string;
  category: string;
  content: string;
  source: string;
  version: number;
  updated_at: string;
};

function formatValue(value: unknown, depth = 0): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => formatValue(item, depth + 1))
      .filter(Boolean)
      .join(depth > 0 ? '; ' : '\n');
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const formatted = formatValue(item, depth + 1);
        return formatted ? `${FIELD_LABELS[key] ?? key}: ${formatted}` : '';
      })
      .filter(Boolean)
      .join('; ');
  }
  return '';
}

function serializeData(data: Record<string, unknown>): string {
  return Object.entries(data)
    .filter(([key]) => !SKIP_FIELDS.has(key))
    .map(([key, value]) => {
      const formatted = formatValue(value);
      if (!formatted) return '';
      return `${FIELD_LABELS[key] ?? key}:\n${formatted}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function itemTitle(type: string, data: Record<string, unknown>): string {
  const title = String(data.title ?? data.name ?? data.question ?? '').trim();
  if (title) return title.slice(0, 140);
  return `${TYPE_LABELS[type] ?? type} ${String(data.code ?? '').trim()}`.trim();
}

function itemCategory(type: string, data: Record<string, unknown>): string {
  return String(
    data.category ?? data.group ?? data.series ?? TYPE_LABELS[type] ?? type,
  ).trim();
}

export function toDoc(row: ContentRow): KnowledgeDoc | null {
  const data = row.data ?? {};
  const rawStatus = String(data.knowledgeStatus ?? '').toLowerCase();
  const status: KnowledgeDoc['status'] =
    rawStatus === 'draft' || rawStatus === 'archived' ? rawStatus : 'published';
  if (status !== 'published') return null;

  const label = TYPE_LABELS[row.type] ?? row.type;
  const sample = Boolean(data.sample);
  const title = itemTitle(row.type, data);
  const body = serializeData(data);
  if (!body && !title) return null;

  return {
    id: row.id,
    title,
    category: itemCategory(row.type, data),
    source: label,
    type: row.type,
    status,
    updatedAt: row.updated_at,
    sample,
    content: [
      sample ? '[DATA CONTOH — jangan dianggap kebijakan resmi Samaqu]' : '',
      body,
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 3200),
  };
}

export function toMemoryDoc(row: MemoryRow): KnowledgeDoc {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    source: 'Organizational Memory',
    type: 'memory',
    status: 'published',
    updatedAt: row.updated_at,
    sample: false,
    content: `${row.source ? `Sumber: ${row.source}\n` : ''}${row.content}`.slice(0, 3200),
  };
}

export function sourceOf(doc: KnowledgeDoc): KnowledgeSource {
  return {
    id: doc.id,
    title: doc.title,
    category: doc.category,
    source: doc.source,
    type: doc.type,
    status: doc.status,
    updatedAt: doc.updatedAt,
    sample: doc.sample,
  };
}
