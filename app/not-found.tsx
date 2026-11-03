import { AppLink as Link } from '@/components/ui/AppLink';

export default function NotFound() {
  return (
    <div className="app-loading">
      <div>
        <div className="eyebrow">404</div>
        <h1>Halaman tidak ditemukan</h1>
        <p className="sub">Menu yang kamu cari tidak tersedia di Samaqu CS Academy.</p>
        <Link className="btn p mt" href="/">
          Kembali ke Overview
        </Link>
      </div>
    </div>
  );
}
