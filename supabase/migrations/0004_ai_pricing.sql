-- Optional token pricing so usage logs can show an estimated cost.
alter table public.ai_settings
  add column if not exists pricing jsonb not null default '{}'::jsonb;

-- Per-user long-term memory preference. 0 means keep history indefinitely.
create table if not exists public.ai_user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  retention_days integer not null default 90 check (retention_days between 0 and 3650),
  updated_at timestamptz not null default now()
);

drop trigger if exists ai_user_settings_touch_updated_at on public.ai_user_settings;
create trigger ai_user_settings_touch_updated_at
  before update on public.ai_user_settings
  for each row execute function public.touch_updated_at();

alter table public.ai_user_settings enable row level security;

revoke all on table public.ai_user_settings from anon;
grant select, insert, update, delete on table public.ai_user_settings to authenticated;

drop policy if exists ai_user_settings_own_select on public.ai_user_settings;
create policy ai_user_settings_own_select
  on public.ai_user_settings for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists ai_user_settings_own_insert on public.ai_user_settings;
create policy ai_user_settings_own_insert
  on public.ai_user_settings for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists ai_user_settings_own_update on public.ai_user_settings;
create policy ai_user_settings_own_update
  on public.ai_user_settings for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists ai_user_settings_own_delete on public.ai_user_settings;
create policy ai_user_settings_own_delete
  on public.ai_user_settings for delete
  to authenticated
  using ((select auth.uid()) = user_id);
