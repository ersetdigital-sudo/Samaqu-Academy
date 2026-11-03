import { Suspense } from 'react';
import { ProblemsView } from '@/features/problems/ProblemsView';

export const metadata = { title: 'Problem Solving' };

export default function ProblemsPage() {
  return (
    <Suspense fallback={<div className="app-loading"><div><div className="spinner" />Memuat Problem Solving…</div></div>}>
      <ProblemsView />
    </Suspense>
  );
}
