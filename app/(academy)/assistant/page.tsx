import { Suspense } from 'react';
import { AssistantView } from '@/features/assistant/AssistantView';

export const metadata = { title: 'AI Knowledge Assistant' };

export default function AssistantPage() {
  return (
    <Suspense
      fallback={
        <div className="app-loading">
          <div>
            <div className="spinner" />
            Memuat assistant…
          </div>
        </div>
      }
    >
      <AssistantView />
    </Suspense>
  );
}
