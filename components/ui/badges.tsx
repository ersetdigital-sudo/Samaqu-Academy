import type { CaseMark, ProductCategory, Severity } from '@/lib/types';
import { scoreTagClass } from '@/lib/utils/format';

export function SeverityTag({ severity }: { severity: Severity }) {
  const className = severity === 'Tinggi' ? 'rd' : severity === 'Sedang' ? 'yl' : 'gr';
  return <span className={`tag ${className}`}>{severity}</span>;
}

export function ProductStatusTag({ status }: { status: string }) {
  if (!status) return null;
  const className =
    status === 'Tersedia' ? 'gr' : status === 'Habis' || status === 'Tidak Aktif' ? 'rd' : 'yl';
  return <span className={`tag ${className}`}>{status}</span>;
}

export function CaseMarkTag({ mark }: { mark: CaseMark }) {
  if (!mark) return null;
  const className = mark === 'Perlu Perbaikan' ? 'rd' : mark === 'Contoh Praktik Baik' ? 'gr' : 'yl';
  return <span className={`tag ${className}`}>{mark}</span>;
}

export function LevelTag({ level }: { level: string }) {
  const className = level === 'Sulit' ? 'rd' : level === 'Sedang' ? 'yl' : 'gr';
  return <span className={`tag ${className}`}>{level}</span>;
}

export function ScoreTag({ score }: { score: number }) {
  return <span className={`tag ${scoreTagClass(score)}`}>{score}</span>;
}

export function CategoryTag({ category }: { category: ProductCategory | string }) {
  return <span className="tag">{category}</span>;
}
