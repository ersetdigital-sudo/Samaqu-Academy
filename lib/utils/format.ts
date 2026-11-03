export function formatDate(value: number | string | Date): string {
  try {
    return new Date(value).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export function formatDateTime(value: number | string | Date): string {
  try {
    return new Date(value).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function rupiah(value: string | number | null | undefined): string {
  if (value === '' || value == null || Number.isNaN(Number(value))) return '';
  return `Rp${Number(value).toLocaleString('id-ID')}`;
}

export function scoreColor(value: number): string {
  return value >= 80 ? '#3E6A54' : value >= 65 ? '#9A6A12' : '#B42318';
}

export function clampScore(value: number): number {
  return Math.max(15, Math.min(98, Math.round(value)));
}

export function scoreTagClass(value: number): string {
  return value >= 80 ? 'gr' : value >= 65 ? 'yl' : 'rd';
}
