import { Suspense } from 'react';
import { JobDeskView } from '@/features/jobdesk/JobDeskView';

export const metadata = { title: 'Job Desk' };

export default function JobDeskPage() {
  return (
    <Suspense fallback={<div className="app-loading"><div><div className="spinner" />Memuat Job Desk…</div></div>}>
      <JobDeskView />
    </Suspense>
  );
}
