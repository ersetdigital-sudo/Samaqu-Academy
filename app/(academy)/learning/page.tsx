import { Suspense } from 'react';
import { LearningView } from '@/features/learning/LearningView';

export const metadata = { title: 'Learning Center' };

export default function LearningPage() {
  return (
    <Suspense fallback={<div className="app-loading"><div><div className="spinner" />Memuat materi…</div></div>}>
      <LearningView />
    </Suspense>
  );
}
