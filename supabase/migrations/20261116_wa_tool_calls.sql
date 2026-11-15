-- Pelajaran AI, Fase 1: rekam jejak terstruktur agent WA.
-- Murni tambahan: tidak mengubah kolom, baris, atau perilaku yang sudah ada.
--   * wa_agent_runs.inbox_ids : id pesan (wa_inbox.id, SAMAQU) yang ditangani run itu. Kunci penghubung
--     run <-> eskalasi/draft di database SAMAQU (tanpa foreign key lintas database).
--   * wa_tool_calls            : satu baris per panggilan tool (argumen/hasil sudah disamarkan oleh agent).
-- Tabel layanan: RLS aktif tanpa policy, hanya service_role (pola yang sama dengan wa_closings).

alter table public.wa_agent_runs
  add column if not exists inbox_ids text[];

create index if not exists wa_agent_runs_inbox_ids_idx
  on public.wa_agent_runs using gin (inbox_ids);

create table if not exists public.wa_tool_calls (
  id bigint generated always as identity primary key,
  run_id bigint not null references public.wa_agent_runs (id) on delete cascade,
  seq integer not null,
  tool_name text not null,
  tool_arguments jsonb,
  tool_result text,
  status text not null default 'ok' check (status in ('ok', 'error')),
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists wa_tool_calls_run_idx
  on public.wa_tool_calls (run_id, seq);
create index if not exists wa_tool_calls_created_idx
  on public.wa_tool_calls (created_at desc);
create index if not exists wa_tool_calls_tool_idx
  on public.wa_tool_calls (tool_name, created_at desc);

grant select, insert, delete on public.wa_tool_calls to service_role;

alter table public.wa_tool_calls enable row level security;
