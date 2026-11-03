import type { KnowledgeDoc } from './knowledge-documents.ts';

const STOPWORDS = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'dengan', 'ini', 'itu', 'apa',
  'apakah', 'bagaimana', 'gimana', 'kalau', 'kalo', 'jika', 'bisa', 'boleh',
  'ada', 'tidak', 'nggak', 'gak', 'saya', 'aku', 'kami', 'kita', 'kak', 'nya',
  'mau', 'minta', 'tolong', 'dong', 'ya', 'kah', 'sih', 'deh', 'nih', 'tuh',
  'biar', 'jadi', 'sudah', 'udah', 'belum', 'masih', 'juga', 'saja', 'aja',
  'secara', 'atau', 'pada', 'oleh', 'agar', 'supaya', 'dalam', 'sama',
  'seperti', 'contoh', 'the', 'and', 'for', 'with', 'how', 'what', 'is', 'are',
  'to', 'of', 'in', 'on', 'or', 'a', 'an',
]);

const SYNONYMS: Record<string, string> = {
  pengiriman: 'kirim',
  dikirim: 'kirim',
  mengirim: 'kirim',
  kirimnya: 'kirim',
  keterlambatan: 'lambat',
  terlambat: 'lambat',
  telat: 'lambat',
  pengembalian: 'retur',
  dikembalikan: 'retur',
  refund: 'retur',
  pembatalan: 'batal',
  dibatalkan: 'batal',
  ukuran: 'size',
  ukur: 'size',
  bahan: 'fabric',
  kain: 'fabric',
  harga: 'price',
  biaya: 'price',
  ketersediaan: 'status',
  stok: 'status',
  keluhan: 'komplain',
  komplain: 'komplain',
  pengemasan: 'packing',
  kemasan: 'packing',
  pembayaran: 'bayar',
  dibayar: 'bayar',
  dipercepat: 'cepat',
  percepat: 'cepat',
};

export interface ScoredDoc {
  doc: KnowledgeDoc;
  score: number;
}

function normalizeWord(word: string): string {
  let value = word.toLowerCase().replace(/[^a-z0-9-]/g, '');
  value = value.replace(/(nya|kah|lah|pun|ku|mu)$/u, '');
  return SYNONYMS[value] ?? value;
}

export function tokens(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9-]+/u)
    .map(normalizeWord)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
}

function scoreDoc(doc: KnowledgeDoc, queryTokens: string[]): number {
  if (!queryTokens.length) return 0;
  const titleText = doc.title.toLowerCase();
  const categoryText = doc.category.toLowerCase();
  const contentText = doc.content.toLowerCase();
  const titleTokens = tokens(titleText);
  const categoryTokens = tokens(categoryText);
  const contentTokens = tokens(contentText);

  const count = (list: string[], token: string) =>
    list.reduce((total, item) => (item === token ? total + 1 : total), 0);

  let score = 0;
  queryTokens.forEach((token) => {
    const inTitle = count(titleTokens, token);
    const inCategory = count(categoryTokens, token);
    const inContent = count(contentTokens, token);
    score += inTitle * 5 + inCategory * 2 + Math.min(3, inContent);
  });

  const codes: string[] = titleText.match(/\b[a-z]{1,3}-\d{2,3}\b/gi) ?? [];
  const questionCodes = queryTokens.filter((token) => /^[a-z]{1,3}-\d{2,3}$/i.test(token));
  if (codes.length && questionCodes.length) {
    questionCodes.forEach((code) => {
      if (codes.includes(code.toLowerCase()) || contentText.includes(code.toLowerCase())) {
        score += 8;
      }
    });
  }

  if (doc.sample) score *= 0.85;
  return score;
}

export function rankDocs(docs: KnowledgeDoc[], question: string, limit: number): ScoredDoc[] {
  const queryTokens = Array.from(new Set(tokens(question)));
  return docs
    .map((doc) => ({ doc, score: scoreDoc(doc, queryTokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
