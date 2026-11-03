-- Samaqu AI Brain, memory, encrypted provider settings, and usage logs.

create table if not exists public.ai_settings (
  id smallint primary key default 1 check (id = 1),
  provider text not null default 'xiaomi-mimo',
  plan text not null default 'payg' check (plan in ('payg', 'token_plan', 'custom')),
  base_url text not null default 'https://api.xiaomimimo.com/v1',
  api_key_ciphertext text,
  api_key_iv text,
  api_key_last4 text,
  default_model text not null default 'mimo-v2.6',
  feature_models jsonb not null default '{}'::jsonb,
  behavior jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.ai_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.ai_usage_logs (
  id text primary key,
  user_id uuid references auth.users (id) on delete set null,
  user_email text,
  feature text not null check (feature in ('assistant', 'reviewer', 'simulator', 'admin_test', 'admin_models')),
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  status text not null check (status in ('success', 'error')),
  error text,
  latency_ms integer,
  estimated_cost numeric(12, 6),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_logs_user_created_idx
  on public.ai_usage_logs (user_id, created_at desc);

create table if not exists public.ai_conversations (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Percakapan Baru',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_conversations_user_updated_idx
  on public.ai_conversations (user_id, updated_at desc);

create table if not exists public.ai_messages (
  id text primary key,
  conversation_id text not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  provider text,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_conversation_created_idx
  on public.ai_messages (conversation_id, created_at asc);

create table if not exists public.memory_items (
  id text primary key,
  title text not null,
  category text not null default 'Operasional',
  content text not null,
  source text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  version integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memory_items_status_updated_idx
  on public.memory_items (status, updated_at desc);

drop trigger if exists ai_settings_touch_updated_at on public.ai_settings;
create trigger ai_settings_touch_updated_at
  before update on public.ai_settings
  for each row execute function public.touch_updated_at();

drop trigger if exists ai_conversations_touch_updated_at on public.ai_conversations;
create trigger ai_conversations_touch_updated_at
  before update on public.ai_conversations
  for each row execute function public.touch_updated_at();

drop trigger if exists memory_items_touch_updated_at on public.memory_items;
create trigger memory_items_touch_updated_at
  before update on public.memory_items
  for each row execute function public.touch_updated_at();

alter table public.ai_settings enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.memory_items enable row level security;

-- ai_settings is only readable/writable through the service role (Edge Functions).
revoke all on table public.ai_settings from anon, authenticated;
revoke all on table public.ai_usage_logs from anon;
revoke all on table public.ai_conversations from anon;
revoke all on table public.ai_messages from anon;
revoke all on table public.memory_items from anon;

grant select on table public.ai_usage_logs to authenticated;
grant select, insert, update, delete on table public.ai_conversations to authenticated;
grant select, insert, delete on table public.ai_messages to authenticated;
grant select, insert, update, delete on table public.memory_items to authenticated;

drop policy if exists ai_usage_owner_select on public.ai_usage_logs;
create policy ai_usage_owner_select
  on public.ai_usage_logs for select
  to authenticated
  using (public.is_owner());

drop policy if exists ai_conversations_own_select on public.ai_conversations;
create policy ai_conversations_own_select
  on public.ai_conversations for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists ai_conversations_own_insert on public.ai_conversations;
create policy ai_conversations_own_insert
  on public.ai_conversations for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists ai_conversations_own_update on public.ai_conversations;
create policy ai_conversations_own_update
  on public.ai_conversations for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists ai_conversations_own_delete on public.ai_conversations;
create policy ai_conversations_own_delete
  on public.ai_conversations for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists ai_messages_own_select on public.ai_messages;
create policy ai_messages_own_select
  on public.ai_messages for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists ai_messages_own_insert on public.ai_messages;
create policy ai_messages_own_insert
  on public.ai_messages for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists ai_messages_own_delete on public.ai_messages;
create policy ai_messages_own_delete
  on public.ai_messages for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists memory_owner_select on public.memory_items;
create policy memory_owner_select
  on public.memory_items for select
  to authenticated
  using (public.is_owner());

drop policy if exists memory_owner_insert on public.memory_items;
create policy memory_owner_insert
  on public.memory_items for insert
  to authenticated
  with check (public.is_owner());

drop policy if exists memory_owner_update on public.memory_items;
create policy memory_owner_update
  on public.memory_items for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists memory_owner_delete on public.memory_items;
create policy memory_owner_delete
  on public.memory_items for delete
  to authenticated
  using (public.is_owner());

-- Module content is treated as published knowledge. Items may opt out with
-- data.knowledgeStatus = 'draft' or 'archived'; organizational memory additionally
-- uses memory_items.status (only 'published' is sent to the model).
