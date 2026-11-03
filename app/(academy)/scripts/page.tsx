import { Suspense } from 'react';
import { ScriptsView } from '@/features/scripts/ScriptsView';

export const metadata = { title: 'Script Library' };

export default function ScriptsPage() {
  return (
    <Suspense fallback={<div className="app-loading"><div><div className="spinner" />Memuat Script Library…</div></div>}>
      <ScriptsView />
    </Suspense>
  );
}
