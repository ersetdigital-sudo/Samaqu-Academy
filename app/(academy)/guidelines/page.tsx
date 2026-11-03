import { Suspense } from 'react';
import { GuidelinesView } from '@/features/guidelines/GuidelinesView';

export const metadata = { title: 'Communication Guidelines' };

export default function GuidelinesPage() {
  return (
    <Suspense fallback={<div className="app-loading"><div><div className="spinner" />Memuat guidelines…</div></div>}>
      <GuidelinesView />
    </Suspense>
  );
}
