/**
 * Analisis "Pelajaran AI" Fase 1: murni (tanpa jaringan, tanpa AI), hanya MEMBACA data eskalasi dan
 * pelajaran lalu merangkumnya. Tidak ada yang ditulis atau diubah.
 *
 * Pengelompokan memakai aturan kata kunci yang sengaja sederhana dan bisa dibaca orang: hasilnya
 * "perkiraan kasar" untuk melihat pola, bukan kebenaran. Penyarian oleh AI baru ada di Fase 2.
 */

export interface EscalationRow {
  id: string;
  inbox_id?: string | null;
  sender?: string | null;
  sender_name?: string | null;
  reason?: string | null;
  summary?: string | null;
  customer_message?: string | null;
  status?: string | null;
  instruction?: string | null;
  learning_id?: string | null;
  created_at: string;
}

export interface LearningRow {
  id: string;
  scope?: string | null;
  sender?: string | null;
  topic?: string | null;
  instruction?: string | null;
  example_question?: string | null;
  status?: string | null;
  created_at: string;
}

export type KindKey =
  | 'gosend'
  | 'lampiran'
  | 'komplain'
  | 'pembayaran'
  | 'pengiriman'
  | 'stok'
  | 'ukuran'
  | 'promo'
  | 'produk'
  | 'lainnya';
export type Nature = 'pengetahuan' | 'tool' | 'keputusan_owner' | 'alur_kerja' | 'aksi_admin' | 'perlu_dicek';

interface KindDef {
  key: KindKey;
  label: string;
  nature: Nature;
  hint: string;
  words: RegExp | null;
}

/** Urutan = prioritas: kata kunci pertama yang cocok menang. */
export const KINDS: KindDef[] = [
  {
    key: 'gosend',
    label: 'GoSend',
    nature: 'tool',
    hint: 'Agent belum punya cara cek ongkir GoSend dan belum tahu alur GoSend SAMAQU vs Customer.',
    words: /gosend|go-send|same ?day|instant|gojek/,
  },
  {
    key: 'lampiran',
    label: 'Lampiran yang tidak terbaca',
    nature: 'tool',
    hint: 'Pesan suara atau lampiran yang tidak bisa diproses agent. Kekurangan kemampuan, bukan kekurangan pengetahuan.',
    words: /lampiran suara|voice|\.ogg|audio|pesan suara/,
  },
  {
    key: 'komplain',
    label: 'Komplain dan retur',
    nature: 'aksi_admin',
    hint: 'Butuh admin mengecek pesanan. Pelajaran umum hanya soal cara merespons dan data apa yang diminta.',
    words: /komplain|retur|tukar|salah kirim|tidak sesuai|rusak|cacat|kepanjangan|kependekan|tidak ada (hanger|cover)|bonus cover/,
  },
  {
    key: 'pembayaran',
    label: 'Pembayaran dan closing',
    nature: 'alur_kerja',
    hint: 'Biasanya bukan soal pengetahuan, tapi alur: bukti masuk tanpa closing, nominal berubah-ubah, ubah alamat setelah transfer.',
    words: /bukti|transfer|qris|nominal|rekening|closing|pembayaran|mutasi|bayar|batal|ubah alamat|kode pos/,
  },
  {
    key: 'pengiriman',
    label: 'Info pengiriman',
    nature: 'pengetahuan',
    hint: 'Status paket, estimasi tiba, resi tertahan di transit. Bisa dijawab dengan aturan umum yang baik.',
    words: /resi|paket|pengiriman|transit|j&t|jnt|manifes|ongkir|estimasi sampai|belum sampai|kapan (dikirim|sampai)/,
  },
  {
    key: 'stok',
    label: 'Stok habis dan restock',
    nature: 'keputusan_owner',
    hint: 'Customer menunggu restock atau Pre-Order. Perlu kebijakan: tawarkan alternatif, jangan janji tanggal.',
    words: /stok|restock|habis|pre-?order|\bpo\b|2xl|xxl/,
  },
  {
    key: 'ukuran',
    label: 'Ukuran di luar tabel',
    nature: 'keputusan_owner',
    hint: 'TB/BB atau ukuran custom yang tidak ada di tabel, dan potong panjang. Perlu keputusan owner (rekomendasi atau dialihkan ke admin).',
    // \bcustom\b dan \bpotong\b dengan batas kata: tanpa itu "Customer" dan "potongan" ikut cocok (hampir semua ringkasan diawali "Customer").
    words: /ukuran|size|tb \d|bb \d|lingkar|\bcustom\b|penjahit|di luar tabel|potong panjang|\bpotong\b/,
  },
  {
    key: 'promo',
    label: 'Promo, diskon, grosir',
    nature: 'keputusan_owner',
    hint: 'Kebijakan harga yang belum ada di data agent (grosir, diskon pembelian kedua, potongan khusus).',
    words: /diskon|promo|grosir|selusin|potongan (ep|harga|diskon|khusus|buat)|\bep\b|create your price|cyp|free cover/,
  },
  {
    key: 'produk',
    label: 'Info produk tidak ada di data',
    nature: 'pengetahuan',
    hint: 'Pertanyaan soal produk, kain, model, atau toko yang jawabannya belum ada. Cocok jadi pelajaran sekali jawab.',
    words: /data tidak ditemukan|produk|warna|video|kain|gamis|kabak|model|slim|cutting|toko|offline|ambil langsung|paper bag|tali/,
  },
  { key: 'lainnya', label: 'Lainnya', nature: 'perlu_dicek', hint: 'Tidak cocok dengan kelompok mana pun; perlu dilihat satu per satu.', words: null },
];

export const NATURE_LABEL: Record<Nature, string> = {
  pengetahuan: 'Pengetahuan',
  tool: 'Tool kurang',
  keputusan_owner: 'Keputusan owner',
  alur_kerja: 'Alur kerja',
  aksi_admin: 'Aksi admin',
  perlu_dicek: 'Perlu dicek',
};

const PHONE_RE = /(?<![A-Za-z\d])(?:\+?62|0)8\d{7,12}(?!\d)/g;

export function maskDigits(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length <= 5) return '***';
  return `${digits.slice(0, 2)}${'*'.repeat(digits.length - 5)}${digits.slice(-3)}`;
}

function clip(text: unknown, max: number): string {
  const clean = String(text ?? '').replace(PHONE_RE, (m) => maskDigits(m)).replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/** Nomor pengirim dinormalkan ke digit saja (62…) supaya satu customer dikenali sebagai satu orang. */
export function senderKey(sender: unknown): string {
  const digits = String(sender ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
}

export function classify(row: Pick<EscalationRow, 'reason' | 'summary'>): KindDef {
  const text = `${row.reason ?? ''} ${row.summary ?? ''}`.toLowerCase();
  for (const kind of KINDS) {
    if (kind.words && kind.words.test(text)) return kind;
  }
  return KINDS[KINDS.length - 1];
}

export interface CaseExample {
  id: string;
  inboxId: string | null;
  when: string;
  who: string;
  status: string;
  reason: string;
  summary: string;
}

export interface KindGroup {
  key: KindKey;
  label: string;
  nature: Nature;
  natureLabel: string;
  hint: string;
  cases: number;
  open: number;
  uniqueOpen: number;
  customers: number;
  examples: CaseExample[];
}

export interface RepeatCustomer {
  who: string;
  cases: number;
  open: number;
  kinds: string[];
  firstAt: string;
  lastAt: string;
}

export interface LearningReview {
  id: string;
  topic: string;
  scope: string;
  chars: number;
  created_at: string;
  flags: string[];
}

export interface LessonsOverview {
  generatedAt: string;
  totals: {
    escalations: number;
    open: number;
    answered: number;
    closed: number;
    uniqueOpen: number;
    duplicateOpen: number;
    learnings: number;
    published: number;
    needReview: number;
  };
  groups: KindGroup[];
  repeats: RepeatCustomer[];
  learnings: LearningReview[];
}

export const LEARNING_MAX_CHARS = 300;

/** Pelajaran yang berisi data satu kasus (order, resi, rekening, nominal) atau terlalu panjang. */
export function reviewLearning(row: LearningRow): LearningReview {
  const text = String(row.instruction ?? '');
  const flags: string[] = [];
  if (text.length > LEARNING_MAX_CHARS) flags.push(`terlalu panjang (${text.length} karakter, batas saran ${LEARNING_MAX_CHARS})`);
  if (/\b[A-Z]{2,4}-\d{8}-\d{2,4}\b/.test(text) || /\bJO\d{8,}\b/.test(text)) flags.push('memuat nomor order atau resi satu kasus');
  if (/(?<![A-Za-z\d])\d{9,}(?!\d)/.test(text)) flags.push('memuat nomor panjang (rekening atau telepon)');
  if (/Rp\s?\d/.test(text)) flags.push('memuat nominal rupiah tertentu');
  if (/^\s*#{1,3}\s/m.test(text)) flags.push('berbentuk dokumen, lebih cocok di Memory');
  return {
    id: String(row.id),
    topic: clip(row.topic || '(tanpa topik)', 90),
    scope: String(row.scope || ''),
    chars: text.length,
    created_at: row.created_at,
    flags,
  };
}

const isOpen = (status: unknown) => String(status ?? '') === 'open';

export function analyze(escalations: EscalationRow[], learnings: LearningRow[], now = new Date()): LessonsOverview {
  const byKind = new Map<KindKey, { rows: EscalationRow[] }>();
  for (const kind of KINDS) byKind.set(kind.key, { rows: [] });
  const perCustomer = new Map<string, EscalationRow[]>();

  for (const row of escalations) {
    byKind.get(classify(row).key)!.rows.push(row);
    const key = senderKey(row.sender);
    if (key) {
      const list = perCustomer.get(key) || [];
      list.push(row);
      perCustomer.set(key, list);
    }
  }

  // Kasus unik yang masih open: satu customer + satu kelompok dihitung sekali.
  const uniqueOpenSet = new Set<string>();
  let openTotal = 0;
  for (const row of escalations) {
    if (!isOpen(row.status)) continue;
    openTotal += 1;
    uniqueOpenSet.add(`${senderKey(row.sender) || row.id}|${classify(row).key}`);
  }

  const groups: KindGroup[] = KINDS.map((kind) => {
    const rows = (byKind.get(kind.key)?.rows || []).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const openRows = rows.filter((row) => isOpen(row.status));
    const uniq = new Set(openRows.map((row) => senderKey(row.sender) || row.id));
    return {
      key: kind.key,
      label: kind.label,
      nature: kind.nature,
      natureLabel: NATURE_LABEL[kind.nature],
      hint: kind.hint,
      cases: rows.length,
      open: openRows.length,
      uniqueOpen: uniq.size,
      customers: new Set(rows.map((row) => senderKey(row.sender) || row.id)).size,
      examples: rows.slice(0, 4).map((row) => ({
        id: String(row.id),
        inboxId: row.inbox_id ? String(row.inbox_id) : null,
        when: row.created_at,
        who: row.sender ? maskDigits(String(row.sender)) : '-',
        status: String(row.status ?? ''),
        reason: clip(row.reason, 90),
        summary: clip(row.summary || row.customer_message, 170),
      })),
    };
  })
    .filter((group) => group.cases > 0)
    .sort((a, b) => b.open - a.open || b.cases - a.cases);

  const repeats: RepeatCustomer[] = [...perCustomer.entries()]
    .filter(([, rows]) => rows.length >= 3)
    .map(([key, rows]) => {
      const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
      return {
        who: maskDigits(key),
        cases: rows.length,
        open: rows.filter((row) => isOpen(row.status)).length,
        kinds: [...new Set(rows.map((row) => classify(row).label))],
        firstAt: sorted[0].created_at,
        lastAt: sorted[sorted.length - 1].created_at,
      };
    })
    .sort((a, b) => b.cases - a.cases)
    .slice(0, 12);

  const reviewed = learnings
    .map(reviewLearning)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return {
    generatedAt: now.toISOString(),
    totals: {
      escalations: escalations.length,
      open: openTotal,
      answered: escalations.filter((row) => row.status === 'answered').length,
      closed: escalations.filter((row) => row.status === 'closed').length,
      uniqueOpen: uniqueOpenSet.size,
      duplicateOpen: Math.max(0, openTotal - uniqueOpenSet.size),
      learnings: learnings.length,
      published: learnings.filter((row) => row.status === 'published').length,
      needReview: reviewed.filter((item) => item.flags.length > 0).length,
    },
    groups,
    repeats,
    learnings: reviewed,
  };
}

/** Ringkasan tool dari wa_tool_calls (7 hari terakhir) untuk menunjukkan bahwa rekam jejak berjalan. */
export interface ToolCallStat {
  tool: string;
  calls: number;
  errors: number;
  avgMs: number;
}

export function summarizeToolCalls(
  rows: Array<{ tool_name: string; status: string; duration_ms: number | null }>,
): { total: number; errors: number; tools: ToolCallStat[] } {
  const map = new Map<string, { calls: number; errors: number; ms: number }>();
  let errors = 0;
  for (const row of rows) {
    const entry = map.get(row.tool_name) || { calls: 0, errors: 0, ms: 0 };
    entry.calls += 1;
    entry.ms += Number(row.duration_ms) || 0;
    if (row.status === 'error') {
      entry.errors += 1;
      errors += 1;
    }
    map.set(row.tool_name, entry);
  }
  const tools = [...map.entries()]
    .map(([tool, entry]) => ({ tool, calls: entry.calls, errors: entry.errors, avgMs: Math.round(entry.ms / entry.calls) }))
    .sort((a, b) => b.calls - a.calls);
  return { total: rows.length, errors, tools };
}
