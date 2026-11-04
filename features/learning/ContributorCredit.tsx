'use client';

import { Icon } from '@/components/ui/Icon';

/**
 * Kredit penyusun materi — chip "Disusun oleh <nama>".
 * `size="md"` dipakai di halaman detail materi, `sm` di kartu daftar.
 */
export function ContributorCredit({
  contributor,
  size = 'sm',
  className,
}: {
  contributor?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (!contributor) return null;

  return (
    <span className={`byline ${size}${className ? ` ${className}` : ''}`}>
      <Icon name="user" size={size === 'sm' ? 12 : 13} />
      <span>
        Disusun oleh <b>{contributor}</b>
      </span>
    </span>
  );
}
