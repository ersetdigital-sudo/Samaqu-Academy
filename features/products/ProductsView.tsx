'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useModal } from '@/components/providers/ModalProvider';
import { useRole } from '@/components/providers/RoleProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/Note';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProductStatusTag } from '@/components/ui/badges';
import { PRODUCT_CATEGORIES } from '@/lib/constants';
import { isGarment } from '@/lib/product-schema';
import type { Product, ProductCategory } from '@/lib/types';
import { rupiah } from '@/lib/utils/format';
import { ProductDetail } from './ProductDetail';
import { ProductForm } from './ProductForm';
import { SeriesMatrix } from './SeriesMatrix';

function productIcon(category: ProductCategory): string {
  if (category === 'Size Chart') return 'ruler';
  if (category === 'Fabric Collection') return 'layers';
  if (category === 'Product Series') return 'library';
  return 'shirt';
}

export function ProductsView() {
  const { snapshot, hydrated, deleteContent, setVisitedProducts } = useData();
  const { canManage } = useRole();
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const openId = searchParams.get('open');
  const [category, setCategory] = useState('Semua');
  const [query, setQuery] = useState('');
  const openedRef = useRef<string | null>(null);
  const openDetailRef = useRef<(id: string) => boolean>(() => false);

  useEffect(() => {
    if (hydrated) void setVisitedProducts();
  }, [hydrated, setVisitedProducts]);

  const products = snapshot.content.products;
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return products.filter((product) => {
      if (category !== 'Semua' && product.category !== category) return false;
      if (!search) return true;
      const fabricName =
        products.find(
          (entry) => entry.category === 'Fabric Collection' && entry.code === product.fabric,
        )?.name ?? '';
      return [product.name, product.code, product.series, product.fabric, fabricName, product.composition]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
  }, [category, products, query]);

  const openProductDetail = (product: Product) => {
    openModal(
      <ProductDetail
        product={product}
        imageUrl={snapshot.images[product.id]}
        products={products}
        canManage={canManage}
        onClose={closeModal}
        onEdit={() => openProductForm(product)}
        onDelete={() => confirmDeleteProduct(product)}
        onOpenProduct={(id) => {
          const next = products.find((entry) => entry.id === id);
          if (next) openProductDetail(next);
        }}
      />,
      { large: true },
    );
  };

  const openProductForm = (current?: Product, initialCategory?: ProductCategory) => {
    const fallbackCategory: ProductCategory =
      category !== 'Semua' ? (category as ProductCategory) : initialCategory ?? 'Thobe';
    openModal(
      <ProductForm
        key={current?.id ?? `new-${fallbackCategory}`}
        current={current}
        initialCategory={current?.category ?? fallbackCategory}
        imageUrl={current ? snapshot.images[current.id] : undefined}
        onClose={closeModal}
        onSaved={(item) => {
          closeModal();
          setQuery('');
          if (category !== 'Semua') setCategory(item.category);
        }}
      />,
      { large: true },
    );
  };

  const confirmDeleteProduct = (product: Product) => {
    openModal(
      <ConfirmDialog
        title="Apakah Anda yakin ingin menghapus produk ini?"
        message={`"${product.name}" akan dihapus dari Product Knowledge. Tindakan ini tidak dapat dibatalkan.`}
        onCancel={closeModal}
        onConfirm={async () => {
          await deleteContent('products', product.id);
          closeModal();
          showToast('Data berhasil dihapus');
        }}
      />,
    );
  };

  openDetailRef.current = (id: string) => {
    const product = products.find((entry) => entry.id === id);
    if (!product) return false;
    openProductDetail(product);
    return true;
  };

  useEffect(() => {
    if (!openId || openedRef.current === openId) return;
    if (openDetailRef.current(openId)) openedRef.current = openId;
  }, [openId, products]);

  const countCategory = (value: string) =>
    value === 'Semua' ? products.length : products.filter((product) => product.category === value).length;

  return (
    <>
      <PageHeader
        eyebrow="Learning & Service"
        title="Product Knowledge"
        subtitle="Pusat informasi produk Samaqu."
        actions={
          canManage ? (
            <button className="btn p" onClick={() => openProductForm()}>
              <Icon name="plus" />
              Tambah Produk
            </button>
          ) : null
        }
      />

      <Note>
        Data bertanda <b>Contoh</b> adalah data dummy, bukan informasi resmi Samaqu. Ganti dengan
        data resmi tim produk. Data dan foto disimpan lokal di browser ini (belum di server).
      </Note>

      <div className="row sp wrap mt">
        <div className="chips">
          {['Semua', ...PRODUCT_CATEGORIES].map((value) => (
            <button
              key={value}
              className={`chip${category === value ? ' on' : ''}`}
              onClick={() => setCategory(value)}
            >
              {value} <span style={{ opacity: 0.6 }}>{countCategory(value)}</span>
            </button>
          ))}
        </div>
        <div className="search" style={{ maxWidth: 300 }}>
          <Icon name="search" />
          <input
            className="inp"
            placeholder="Cari nama, kode, seri, bahan…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Cari produk"
          />
        </div>
      </div>

      {category === 'Semua' || category === 'Product Series' ? (
        <SeriesMatrix
          series={products.filter((product) => product.category === 'Product Series')}
          images={snapshot.images}
          onOpen={openProductDetail}
        />
      ) : null}

      {filtered.length ? (
        <div className="grid g3 mt">
          {filtered.map((product) => {
            const image = snapshot.images[product.id];
            const meta = isGarment(product.category)
              ? [
                  product.series,
                  product.fabric ? `Bahan ${product.fabric}` : '',
                  rupiah(product.price),
                ]
                  .filter(Boolean)
                  .join(' · ')
              : product.category === 'Fabric Collection'
                ? [product.composition, product.gsm ? `${product.gsm} GSM` : '']
                    .filter(Boolean)
                    .join(' · ')
                : product.category === 'Product Series'
                  ? `${product.memberIds.length} produk`
                  : '';
            return (
              <div
                className="card ck"
                key={product.id}
                style={{ display: 'flex', flexDirection: 'column' }}
                role="link"
                tabIndex={0}
                onClick={() => openProductDetail(product)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openProductDetail(product);
                  }
                }}
              >
                <div className="product-thumb">
                  {image ? (
                    <img src={image} alt="" />
                  ) : (
                    <Icon name={productIcon(product.category)} size={36} />
                  )}
                </div>
                <div className="row sp mt">
                  <span className="tag">{product.category}</span>
                  <span className="row" style={{ gap: 4 }}>
                    {product.sample ? <span className="tag">Contoh</span> : null}
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
                        openProductForm(product);
                      }}
                    >
                      <Icon name="pencil" />
                      Edit
                    </button>
                    <button
                      className="btn sm danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        confirmDeleteProduct(product);
                      }}
                    >
                      <Icon name="trash-2" />
                      Hapus
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt">
          <EmptyState
            icon={query ? 'search-x' : 'shirt'}
            title={query ? 'Tidak ada produk yang cocok' : 'Belum ada data'}
            subtitle={
              query
                ? 'Coba kata kunci lain atau ubah filter.'
                : 'Belum ada data pada kategori ini.'
            }
            action={
              canManage ? (
                <button className="btn sm" onClick={() => openProductForm()}>
                  <Icon name="plus" />
                  Tambah
                </button>
              ) : null
            }
          />
        </div>
      )}
    </>
  );
}
