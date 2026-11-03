import { Suspense } from 'react';
import { FlowView } from '@/features/flow/FlowView';

export const metadata = { title: 'Chat Flow' };

export default function FlowPage() {
  return (
    <Suspense fallback={<div className="app-loading"><div><div className="spinner" />Memuat Chat Flow…</div></div>}>
      <FlowView />
    </Suspense>
  );
}
