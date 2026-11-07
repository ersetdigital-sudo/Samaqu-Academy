-- Detail alamat/pesanan untuk rekap admin + penanda sudah dikirim.
alter table public.wa_closings
  add column if not exists address text,
  add column if not exists order_detail text,
  add column if not exists admin_notified_at timestamptz;
