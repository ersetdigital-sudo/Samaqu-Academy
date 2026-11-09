import type { ProductCategory } from '@/lib/types';

export type ProductSection = 'series' | 'fabric' | 'size' | 'product';

export const PRODUCT_SECTIONS: ProductSection[] = ['series', 'fabric', 'size', 'product'];

export const GARMENT_CATEGORIES: ProductCategory[] = ['Thobe', 'Gamis', 'Koko', 'Kandora', 'Kabak', 'Cover & Hanger'];

export interface ProductSectionMeta {
  label: string;
  icon: string;
  blurb: string;
  categories: ProductCategory[];
  newCategory: ProductCategory;
  addLabel: string;
}

export const SECTION_META: Record<ProductSection, ProductSectionMeta> = {
  series: {
    label: 'Series',
    icon: 'library',
    blurb: 'Kenali 6 model Thobe dari kerah dan placket-nya.',
    categories: ['Product Series'],
    newCategory: 'Product Series',
    addLabel: 'Tambah Series',
  },
  fabric: {
    label: 'Bahan',
    icon: 'layers',
    blurb: 'Jenis kain, karakter, dan cara merawatnya.',
    categories: ['Fabric Collection'],
    newCategory: 'Fabric Collection',
    addLabel: 'Tambah Bahan',
  },
  size: {
    label: 'Size Chart',
    icon: 'ruler',
    blurb: 'Tabel ukuran dan cara merekomendasikan size.',
    categories: ['Size Chart'],
    newCategory: 'Size Chart',
    addLabel: 'Tambah Size Chart',
  },
  product: {
    label: 'Produk',
    icon: 'shirt',
    blurb: 'Daftar produk lengkap dengan warna, ukuran, dan harga.',
    categories: GARMENT_CATEGORIES,
    newCategory: 'Thobe',
    addLabel: 'Tambah Produk',
  },
};

export function isProductSection(value: string | null | undefined): value is ProductSection {
  return value === 'series' || value === 'fabric' || value === 'size' || value === 'product';
}

export function isGarmentCategory(value: string | null | undefined): value is ProductCategory {
  return value === 'Thobe' || value === 'Gamis' || value === 'Koko' || value === 'Kandora' || value === 'Kabak' || value === 'Cover & Hanger';
}

/** Legacy `?category=` (and a product's own category) → the section that owns it. */
export function sectionForCategory(category: string | null | undefined): ProductSection | null {
  if (category === 'Product Series') return 'series';
  if (category === 'Fabric Collection') return 'fabric';
  if (category === 'Size Chart') return 'size';
  if (isGarmentCategory(category)) return 'product';
  return null;
}
