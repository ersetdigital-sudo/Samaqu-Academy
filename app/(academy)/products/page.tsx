import { Suspense } from 'react';
import { ProductsView } from '@/features/products/ProductsView';

export const metadata = { title: 'Product Knowledge' };

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="app-loading"><div><div className="spinner" />Memuat Product Knowledge…</div></div>}>
      <ProductsView />
    </Suspense>
  );
}
