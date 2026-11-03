import { Suspense } from 'react';
import { TrainingView } from '@/features/training/TrainingView';

export const metadata = { title: 'Training & Assessment' };

export default function TrainingPage() {
  return (
    <Suspense fallback={<div className="app-loading"><div><div className="spinner" />Memuat Training…</div></div>}>
      <TrainingView />
    </Suspense>
  );
}
