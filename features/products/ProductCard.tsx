'use client';

import { Icon } from '@/components/ui/Icon';
import { ProductStatusTag } from '@/components/ui/badges';
import { isGarment } from '@/lib/product-schema';
import type { Product, ProductCategory } from '@/lib/types';
import { rupiah } from '@/lib/utils/format';

function productIcon(category: ProductCategory): string {
  if (category === 'Size Chart') return 'ruler';
  if (category === 'Fabric Collection') return 'layers';
  if (category === 'Product Series') return 'library';
  return 'shirt';
}

function productMeta(product: Product): string {
  if (isGarment(product.category)) {
    return [product.series, product.fabric ? `Bahan ${product.fabric}` : '', rupiah(product.price)]
      .filter(Boolean)
      .join(' · ');
  }
  if (product.category === 'Fabric Collection') {
    return [product.composition, product.gsm ? `${product.gsm} GSM` : ''].filter(Boolean).join(' · ');
  }
  if (product.category === 'Product Series') return `${product.memberIds.length} produk`;
  return '';
}

interface ProductCardProps {
  product: Product;
  image?: string;
  canManage: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** One product tile; the category tag doubles as the label in cross-category search results. */
export function ProductCard({ product, image, canManage, onOpen, onEdit, onDelete }: ProductCardProps) {
  const meta = productMeta(product);
  return (
    <div
      className="card ck"
      style={{ display: 'flex', flexDirection: 'column' }}
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className={`product-thumb${image ? ' has-img' : ''}`}>
        {image ? <img src={image} alt="" /> : <Icon name={productIcon(product.category)} size={36} />}
      </div>
      <div className="row sp mt">
        <span className="tag">{product.category}</span>
        <span className="row" style={{ gap: 4 }}>
          <ProductStatusTag status={product.status} />
        </span>
      </div>
      <h3 className="mt1">{product.name}</h3>
      <div className="sm muted">
        {product.code}
        {meta ? ` · ${meta}` : ''}
      </div>
      <p className="sm muted mt1 clamp-2" style={{ flex: 1 }}>
        {product.description || product.characteristics || product.guide || ''}
      </p>
      {canManage ? (
        <div className="row mt">
          <button
            className="btn sm"
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
          >
            <Icon name="pencil" />
            Edit
          </button>
          <button
            className="btn sm danger"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <Icon name="trash-2" />
            Hapus
          </button>
        </div>
      ) : null}
    </div>
  );
}
