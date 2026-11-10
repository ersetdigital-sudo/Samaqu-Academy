import type { CaseMark, Role, Severity, ProductCategory } from './types';

export const ROLES: Record<Role, { label: string; manage: boolean }> = {
  owner: { label: 'Owner / Super Admin', manage: true },
  cs: { label: 'Admin CS', manage: false },
};

export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  ownerOnly?: boolean;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'General',
    items: [{ label: 'Overview', href: '/', icon: 'layout-dashboard' }],
  },
  {
    label: 'Learning & Service',
    items: [
      { label: 'Learning Center', href: '/learning', icon: 'graduation-cap' },
      { label: 'Communication Guidelines', href: '/guidelines', icon: 'book-heart' },
      { label: 'Job Desk', href: '/jobdesk', icon: 'briefcase' },
      { label: 'SOP', href: '/sop', icon: 'shield-check' },
      { label: 'Label Chat', href: '/labels', icon: 'tag' },
      { label: 'Chat Flow', href: '/flow', icon: 'route' },
      { label: 'Script Library', href: '/scripts', icon: 'message-square-text' },
      { label: 'Product Knowledge', href: '/products', icon: 'shirt' },
      { label: 'Problem Solving', href: '/problems', icon: 'life-buoy' },
      { label: 'Chat Scenario', href: '/simulator', icon: 'messages-square' },
    ],
  },
  {
    label: 'CRM',
    items: [{ label: 'WA Inbox', href: '/wa', icon: 'message-square-text' }],
  },
  {
    label: 'Development',
    items: [
      { label: 'Training & Assessment', href: '/training', icon: 'clipboard-check' },
      { label: 'My Learning Progress', href: '/progress', icon: 'trending-up' },
    ],
  },
  {
    label: 'AI Tools',
    items: [
      { label: 'AI Chat Reviewer', href: '/reviewer', icon: 'scan-search' },
      { label: 'AI Knowledge Assistant', href: '/assistant', icon: 'sparkles' },
    ],
  },
  {
    label: 'Admin',
    ownerOnly: true,
    items: [
      { label: 'Pengaturan AI', href: '/settings/ai', icon: 'settings' },
      { label: 'Memory Organisasi', href: '/settings/memory', icon: 'brain' },
      { label: 'Kelola Pengguna', href: '/settings/users', icon: 'users' },
    ],
  },
];

export const SCRIPT_CATEGORIES = [
  'Greeting & Opening',
  'Product Inquiry',
  'Size Consultation',
  'Fabric Inquiry',
  'Price Inquiry',
  'Create Your Price',
  'Ordering',
  'Payment Confirmation',
  'Follow Up',
  'Complaint Handling',
  'Shipping Information',
  'After Sales',
] as const;

export const MATERIAL_CATEGORIES = [
  'Introduction to Samaqu',
  'Communication Guidelines',
  'Customer Service Fundamentals',
  'Product Knowledge',
  'Ordering & Payment Process',
  'Shipping & Delivery',
  'Complaint Handling',
  'After Sales Service',
] as const;

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  'Thobe',
  'Gamis',
  'Koko',
  'Kandora',
  'Kabak',
  'Cover & Hanger',
  'Fabric Collection',
  'Size Chart',
  'Product Series',
];

export const CASE_MARKS: CaseMark[] = [
  'Perlu Perbaikan',
  'Contoh Praktik Baik',
  'Materi Pembelajaran',
];

export const PROBLEM_GROUPS = [
  'Pengiriman',
  'Produk',
  'Pembayaran',
  'Pengembalian',
  'Emosi Customer',
] as const;

export const SEVERITIES: Severity[] = ['Rendah', 'Sedang', 'Tinggi'];
export const SCENARIO_LEVELS = ['Mudah', 'Sedang', 'Sulit'] as const;
export const QUIZ_TYPES = ['Multiple choice', 'Studi kasus', 'Pilih respons terbaik'] as const;

export const HEARD_FRAMEWORK = [
  ['H', 'Hear', 'Dengarkan sampai selesai'],
  ['E', 'Empathize', 'Akui perasaan customer'],
  ['A', 'Apologize', 'Minta maaf bila perlu'],
  ['R', 'Resolve', 'Beri solusi sesuai SOP'],
  ['D', 'Diagnose', 'Catat & cegah terulang'],
] as const;

export const REVIEW_ASPECTS = [
  'Pemahaman konteks',
  'Relevansi jawaban',
  'Kejelasan',
  'Naturalitas',
  'Empati',
  'Proaktif',
  'Akurasi produk',
  'Akurasi order',
  'Closing',
  'Manajemen ekspektasi',
] as const;

export const PRODUCT_PHOTO_LABELS: Record<string, string> = {
  'Fabric Collection': 'Foto / Referensi Bahan',
  'Size Chart': 'Gambar Size Chart',
  'Product Series': 'Foto Seri',
};

export const GARMENT_CATEGORIES = ['Thobe', 'Gamis', 'Koko', 'Kandora', 'Kabak', 'Cover & Hanger'] as const;

export const PRODUCT_STATUSES = [
  'Tersedia',
  'Pre-order',
  'Stok Terbatas',
  'Habis',
  'Tidak Aktif',
] as const;

export const SCENARIO_ICONS: Record<string, string> = {
  'Product Inquiry': 'shopping-bag',
  'Size Consultation': 'ruler',
  'Price Inquiry': 'wallet',
  'Shipping Information': 'truck',
  'Complaint Handling': 'alert-triangle',
  'Fabric Inquiry': 'layers',
  'Follow Up': 'repeat',
  Ordering: 'shopping-cart',
  'Payment Confirmation': 'credit-card',
  'After Sales': 'heart-handshake',
  'Greeting & Opening': 'hand',
};

export const ACTIVITY_ICONS: Record<string, string> = {
  scenario: 'messages-square',
  review: 'scan-search',
  material: 'book-open',
  assessment: 'clipboard-check',
};

export const DEFAULT_PASS_MARK = 75;

export const STORAGE_KEYS = {
  content: 'smq_v2_content',
  progress: 'smq_v2_progress',
  activity: 'smq_v2_activity',
  attempts: 'smq_v2_attempts',
  settings: 'smq_v2_settings',
  role: 'smq_role',
} as const;

export const LEGACY_KEYS = {
  materials: 'smq_materials_v1',
  scripts: 'smq_scripts_v2',
  legacyScripts: 'smq_scripts',
  cases: 'smq_cases_v2',
  legacyCases: 'smq_cases',
  beforeAfter: 'smq_ba_v1',
  flow: 'smq_chat_flow_v1',
  guides: 'smq_guidelines_v1',
  problems: 'smq_problem_solving_v1',
  scenarios: 'smq_scenarios_v1',
  quiz: 'smq_quiz_v1',
  products: 'smq_products_v1',
  progress: 'smq_learning_progress_v1',
  activity: 'smq_training_history_v1',
  attempts: 'smq_assessment_history_v1',
  settings: 'smq_assessment_settings_v1',
} as const;
