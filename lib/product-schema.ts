import { PRODUCT_STATUSES } from './constants';
import type { Product, ProductCategory } from './types';

export type ProductFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'number'
  | 'series'
  | 'fabric'
  | 'table'
  | 'members';

export interface ProductField {
  key: keyof Product;
  label: string;
  type?: ProductFieldType;
  required?: boolean;
  section: string;
  full?: boolean;
  placeholder?: string;
  hint?: string;
  options?: readonly string[];
}

const GARMENT: ProductField[] = [
  { key: 'name', label: 'Nama Produk', required: true, section: 'Informasi Umum', placeholder: 'Contoh: Thobe [Nama]' },
  { key: 'code', label: 'Kode Produk / SKU', required: true, section: 'Informasi Umum', placeholder: 'Contoh: TH-001' },
  { key: 'series', label: 'Product Series', type: 'series', section: 'Informasi Umum' },
  { key: 'status', label: 'Status Ketersediaan', type: 'select', required: true, section: 'Informasi Umum', options: PRODUCT_STATUSES },
  { key: 'description', label: 'Deskripsi Produk', type: 'textarea', required: true, section: 'Informasi Umum', full: true },
  { key: 'fabric', label: 'Jenis Bahan', type: 'fabric', section: 'Informasi Produk' },
  { key: 'colors', label: 'Warna / Varian', section: 'Informasi Produk', placeholder: 'Pisahkan dengan koma' },
  { key: 'sizes', label: 'Pilihan Ukuran', section: 'Informasi Produk', placeholder: 'Contoh: S, M, L, XL' },
  { key: 'price', label: 'Harga Jual (Rp)', type: 'number', section: 'Informasi Produk', placeholder: 'Contoh: 350000' },
  { key: 'advantages', label: 'Keunggulan Produk', type: 'textarea', section: 'Informasi Produk', hint: 'Satu keunggulan per baris', full: true },
  { key: 'extra', label: 'Informasi Tambahan', type: 'textarea', section: 'Informasi Produk', full: true },
];

export const SERIES_COLLARS = [
  'Kerah Tegak',
  'Kerah Kemeja',
  'Kerah Kemeja Pin Collar',
] as const;

export const SERIES_PLACKETS = ['Polos', 'Kancing Diamond', 'Eyelet / Mata Ayam'] as const;

export const PRODUCT_SCHEMA: Record<ProductCategory, ProductField[]> = {
  Thobe: GARMENT,
  Gamis: GARMENT,
  Koko: GARMENT,
  'Fabric Collection': [
    { key: 'name', label: 'Nama Bahan', required: true, section: 'Informasi Bahan' },
    { key: 'code', label: 'Kode Bahan', required: true, section: 'Informasi Bahan', placeholder: 'Contoh: B-01' },
    { key: 'composition', label: 'Komposisi', section: 'Informasi Bahan', placeholder: 'Contoh: [isi data resmi]' },
    { key: 'gsm', label: 'Berat Kain (GSM)', type: 'number', section: 'Informasi Bahan' },
    { key: 'characteristics', label: 'Karakteristik Bahan', type: 'textarea', section: 'Detail', full: true },
    { key: 'advantages', label: 'Keunggulan', type: 'textarea', section: 'Detail', hint: 'Satu per baris', full: true },
    { key: 'extra', label: 'Informasi Tambahan / Perawatan', type: 'textarea', section: 'Detail', full: true },
  ],
  'Size Chart': [
    { key: 'name', label: 'Nama Produk / Kategori', required: true, section: 'Informasi Umum' },
    { key: 'table', label: 'Tabel Ukuran', type: 'table', required: true, section: 'Tabel Ukuran', full: true, hint: 'Baris pertama = judul kolom. Pisahkan kolom dengan tanda | (garis tegak).' },
    { key: 'measurement', label: 'Detail Pengukuran', type: 'textarea', section: 'Panduan', full: true, placeholder: 'Contoh: Panjang diukur dari bahu ke bawah…' },
    { key: 'guide', label: 'Panduan Memilih Ukuran', type: 'textarea', section: 'Panduan', full: true },
  ],
  'Product Series': [
    { key: 'name', label: 'Nama Seri', required: true, section: 'Informasi Seri' },
    { key: 'code', label: 'Kode Seri', required: true, section: 'Informasi Seri' },
    { key: 'collar', label: 'Kerah', type: 'select', section: 'Informasi Seri', options: SERIES_COLLARS },
    { key: 'placket', label: 'Placket / Klep', type: 'select', section: 'Informasi Seri', options: SERIES_PLACKETS },
    { key: 'description', label: 'Deskripsi Seri', type: 'textarea', required: true, section: 'Informasi Seri', full: true },
    { key: 'customerPitch', label: 'Cara menjelaskan ke customer', type: 'textarea', section: 'Informasi Seri', full: true },
    { key: 'characteristics', label: 'Karakteristik', type: 'textarea', section: 'Informasi Seri', full: true },
    { key: 'memberIds', label: 'Produk dalam Seri Ini', type: 'members', section: 'Produk Terkait', full: true },
  ],
};

export function isGarment(category: string): boolean {
  return ['Thobe', 'Gamis', 'Koko'].includes(category);
}

export function getProductFields(category: ProductCategory): ProductField[] {
  return PRODUCT_SCHEMA[category] ?? PRODUCT_SCHEMA.Thobe;
}

export function getProductFieldLabel(category: ProductCategory, key: keyof Product): string {
  return getProductFields(category).find((field) => field.key === key)?.label ?? String(key);
}
