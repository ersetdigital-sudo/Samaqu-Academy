const STATUS_LABELS = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
} as const;

export const MEMORY_STATUS_LABELS = STATUS_LABELS;

export const MEMORY_STATUS_CLASS = {
  draft: 'yl',
  published: 'gr',
  archived: '',
} as const;

export const MEMORY_CATEGORY_OPTIONS = [
  'Operasional',
  'Pengiriman',
  'Produk',
  'Pembayaran',
  'Pengembalian',
  'Komunikasi',
  'Studi Kasus',
  'Praktik Baik',
];

export const MEMORY_FILTERS = ['all', 'draft', 'published', 'archived'] as const;
