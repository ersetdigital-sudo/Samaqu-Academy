-- Closing AI: sumber tunggal untuk laporan jam 7.
-- Dipisah dari leads supaya status lead tetap normal.
create table if not exists public.wa_closings (
  id uuid primary key default gen_random_uuid(),
  inbox_id text not null unique,
  sender text not null,
  sender_name text,
  nominal bigint not null check (nominal > 0),
  proof_url text,
  source text not null default 'ai',
  created_at timestamptz not null default now()
);

create index if not exists wa_closings_created_at_idx
  on public.wa_closings (created_at desc);
create index if not exists wa_closings_sender_idx
  on public.wa_closings (sender);

grant select, insert, update on public.wa_closings to service_role;

alter table public.wa_closings enable row level security;
