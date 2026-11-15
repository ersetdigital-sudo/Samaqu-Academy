-- Pelajaran AI, Fase 2: usulan pelajaran yang disusun AI dan disetujui owner.
-- Murni tambahan: tidak mengubah tabel atau perilaku yang sudah ada. Tabel layanan: RLS aktif tanpa policy,
-- hanya service_role (diakses lewat edge function wa-admin yang memeriksa peran owner).
--
--   wa_lesson_proposals : satu baris per usulan (draf aturan umum, atau pertanyaan untuk owner).
--   wa_lesson_events    : jejak audit (disusun, diedit, diterbitkan, ditolak, ditarik).
--
-- Pelajaran yang diterbitkan tetap hidup di SAMAQU `wa_learnings` (jalur yang sudah dipakai agent);
-- `published_learning_id` hanya menyimpan id-nya (tanpa foreign key lintas database).

create table if not exists public.wa_lesson_proposals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'proposed'
    check (status in ('proposed', 'publishing', 'published', 'rejected', 'retired')),
  group_key text,
  kind text not null default 'perlu_dicek',
  source text not null default 'ai' check (source in ('ai', 'rewrite', 'manual')),
  title text not null,
  lesson_text text not null default '',
  question text,
  note text,
  evidence jsonb not null default '[]'::jsonb,
  cases integer not null default 0,
  replaces_learning_id uuid,
  published_learning_id uuid,
  dedupe_key text,
  model text,
  tokens_in integer,
  tokens_out integer,
  created_by text,
  reviewed_by text,
  reviewed_at timestamptz,
  reject_reason text
);

-- Satu kelompok kasus yang sama tidak boleh punya dua usulan aktif sekaligus.
create unique index if not exists wa_lesson_proposals_dedupe_idx
  on public.wa_lesson_proposals (dedupe_key)
  where dedupe_key is not null and status in ('proposed', 'publishing', 'published');

create index if not exists wa_lesson_proposals_status_idx
  on public.wa_lesson_proposals (status, created_at desc);

create table if not exists public.wa_lesson_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  proposal_id uuid references public.wa_lesson_proposals (id) on delete set null,
  learning_id uuid,
  actor text,
  action text not null,
  detail jsonb
);

create index if not exists wa_lesson_events_proposal_idx
  on public.wa_lesson_events (proposal_id, at desc);

grant select, insert, update on public.wa_lesson_proposals to service_role;
grant select, insert on public.wa_lesson_events to service_role;

alter table public.wa_lesson_proposals enable row level security;
alter table public.wa_lesson_events enable row level security;
