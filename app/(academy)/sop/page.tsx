import { Suspense } from 'react';
import { SopView } from '@/features/sop/SopView';

export const metadata = { title: 'SOP' };

export default function SopPage() {
  return (
    <Suspense fallback={<div className="app-loading"><div><div className="spinner" />Memuat SOP…</div></div>}>
      <SopView />
    </Suspense>
  );
}
