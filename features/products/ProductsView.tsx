'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useModal } from '@/components/providers/ModalProvider';
import { useRole } from '@/components/providers/RoleProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import type { Product, ProductCategory } from '@/lib/types';
import { ProductCard } from './ProductCard';
import { ProductDetail } from './ProductDetail';
import { ProductForm } from './ProductForm';
import { ProductHubCards } from './ProductHubCards';
import { SeriesMatrix } from './SeriesMatrix';
import {
  GARMENT_CATEGORIES,
  SECTION_META,
  isGarmentCategory,
  isProductSection,
  sectionForCategory,
  type ProductSection,
} from './product-sections';

export function ProductsView() {
  const { snapshot, hydrated, deleteContent, setVisitedProducts } = useData();
  const { canManage } = useRole();
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const openId = searchParams.get('open');
  const sectionParam = searchParams.get('section');
  const categoryParam = searchParams.get('category');
  // Legacy `?category=...` links land on the section that owns that category.
  const section: ProductSection | null = isProductSection(sectionParam)
    ? sectionParam
    : sectionForCategory(categoryParam);

  const [query, setQuery] = useState('');
  // Chip filter lives in the URL (`?section=product&category=...`), so it can never go stale.
  const garment: string = isGarmentCategory(categoryParam) ? categoryParam : 'Semua';
  const openedRef = useRef<string | null>(null);
  const openDetailRef = useRef<(id: string) => boolean>(() => false);

  useEffect(() => {
    if (hydrated) void setVisitedProducts();
  }, [hydrated, setVisitedProducts]);

  const products = snapshot.content.products;

  const counts = useMemo(() => {
    const base: Record<ProductSection, number> = { series: 0, fabric: 0, size: 0, product: 0 };
    products.forEach((product) => {
      (Object.keys(base) as ProductSection[]).forEach((key) => {
        if (SECTION_META[key].categories.includes(product.category)) base[key] += 1;
      });
    });
    return base;
  }, [products]);

  const sectionItems = useMemo(
    () =>
      section
        ? products.filter((product) => SECTION_META[section].categories.includes(product.category))
        : [],
    [products, section],
  );

  const visible =
    section === 'product' && garment !== 'Semua'
      ? sectionItems.filter((product) => product.category === garment)
      : sectionItems;

  const search = query.trim();
  const results = useMemo(() => {
    if (!search) return [];
    const needle = search.toLowerCase();
    return products.filter((product) => {
      const fabricName =
        products.find(
          (entry) => entry.category === 'Fabric Collection' && entry.code === product.fabric,
        )?.name ?? '';
      return [product.name, product.code, product.series, product.fabric, fabricName, product.composition]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [products, search]);

  const goToSection = (next: ProductSection | null) => {
    setQuery('');
    if (!next) {
      router.replace('/products', { scroll: false });
      return;
    }
    router.push(`/products?section=${next}`, { scroll: false });
  };

  const selectGarment = (next: string) => {
    router.replace(
      next === 'Semua' ? '/products?section=product' : `/products?section=product&category=${next}`,
      { scroll: false },
    );
  };

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
      initialCategory ??
      (isGarmentCategory(garment) && section === 'product'
        ? garment
        : section
          ? SECTION_META[section].newCategory
          : 'Thobe');
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
          const target = sectionForCategory(item.category);
          if (target && target !== section) goToSection(target);
          else if (isGarmentCategory(item.category)) selectGarment(item.category);
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

  // A deep link that only carries `?open=` still needs a section behind the modal.
  useEffect(() => {
    if (!openId || section) return;
    const product = products.find((entry) => entry.id === openId);
    const target = product ? sectionForCategory(product.category) : null;
    if (target) router.replace(`/products?section=${target}&open=${openId}`, { scroll: false });
  }, [openId, products, router, section]);

  const renderGrid = (items: Product[]) => (
    <div className="grid g3 mt">
      {items.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          image={snapshot.images[product.id]}
          canManage={canManage}
          onOpen={() => openProductDetail(product)}
          onEdit={() => openProductForm(product)}
          onDelete={() => confirmDeleteProduct(product)}
        />
      ))}
    </div>
  );

  const addButton = canManage && section && !search ? (
    <button className="btn p" onClick={() => openProductForm()}>
      <Icon name="plus" />
      {SECTION_META[section].addLabel}
    </button>
  ) : null;

  return (
    <>
      <PageHeader
        eyebrow="Learning & Service"
        title="Product Knowledge"
        subtitle={
          section
            ? SECTION_META[section].blurb
            : 'Pilih bagian yang ingin dipelajari lebih dulu.'
        }
        actions={addButton}
      />

      <div className="row sp wrap mt">
        {section ? (
          <button className="btn sm" onClick={() => goToSection(null)}>
            <Icon name="arrow-left" />
            Semua bagian
          </button>
        ) : (
          <div />
        )}
        <div className="search" style={{ maxWidth: 320 }}>
          <Icon name="search" />
          <input
            className="inp"
            placeholder="Cari semua kategori…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Cari produk"
          />
        </div>
      </div>

      {search ? (
        <div className="mt">
          <div className="row sp wrap">
            <h3 style={{ fontSize: 15.5 }}>Hasil pencarian “{search}”</h3>
            <span className="tag">{results.length} item</span>
          </div>
          {results.length ? (
            renderGrid(results)
          ) : (
            <div className="mt">
              <EmptyState
                icon="search-x"
                title="Tidak ada yang cocok"
                subtitle="Coba kata kunci lain, misalnya nama seri, kode, atau jenis bahan."
              />
            </div>
          )}
        </div>
      ) : section ? (
        <>
          {section === 'series' ? (
            <SeriesMatrix series={sectionItems} images={snapshot.images} onOpen={openProductDetail} />
          ) : null}

          {section === 'product' ? (
            <div className="chips mt">
              {['Semua', ...GARMENT_CATEGORIES].map((value) => (
                <button
                  key={value}
                  className={`chip${garment === value ? ' on' : ''}`}
                  onClick={() => selectGarment(value)}
                >
                  {value}{' '}
                  <span style={{ opacity: 0.6 }}>
                    {value === 'Semua'
                      ? sectionItems.length
                      : sectionItems.filter((product) => product.category === value).length}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {visible.length ? (
            renderGrid(visible)
          ) : (
            <div className="mt">
              <EmptyState
                icon={SECTION_META[section].icon}
                title="Belum ada data di bagian ini"
                subtitle="Tambahkan data baru supaya admin lain bisa mempelajarinya."
                action={
                  canManage ? (
                    <button className="btn sm" onClick={() => openProductForm()}>
                      <Icon name="plus" />
                      {SECTION_META[section].addLabel}
                    </button>
                  ) : null
                }
              />
            </div>
          )}
        </>
      ) : (
        <ProductHubCards counts={counts} onOpen={goToSection} />
      )}
    </>
  );
}
