-- Samaqu CS Academy — schema, RLS, storage
-- Run once against a fresh Supabase project.

create table if not exists public.content_items (
  id text primary key,
  type text not null check (type in (
    'material','script','case','before_after','flow','guide','problem','scenario','quiz','product'
  )),
  sort_order bigint not null default 0,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_items_type_sort_idx
  on public.content_items (type, sort_order);

create table if not exists public.progress (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('material','guide','problem','flow','flag')),
  item_id text not null,
  status text check (status in ('todo','progress','done')),
  progress integer check (progress between 0 and 100),
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);

create index if not exists progress_user_idx on public.progress (user_id);

create table if not exists public.activity_history (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('scenario','review','material','assessment')),
  title text not null,
  score integer,
  ref_id text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists activity_history_user_created_idx
  on public.activity_history (user_id, created_at desc);

create table if not exists public.assessment_attempts (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  score integer not null,
  correct integer not null,
  total integer not null,
  pass boolean not null,
  pass_mark integer not null,
  wrong jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb
);

create index if not exists assessment_attempts_user_created_idx
  on public.assessment_attempts (user_id, created_at desc);

create table if not exists public.assessment_settings (
  id smallint primary key default 1 check (id = 1),
  pass_mark integer not null default 75 check (pass_mark between 1 and 100),
  updated_at timestamptz not null default now()
);

insert into public.assessment_settings (id, pass_mark)
values (1, 75)
on conflict (id) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'cs' check (role in ('owner','cs')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'owner',
    false
  );
$$;

revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text;
begin
  requested_role := case
    when new.raw_app_meta_data ->> 'role' = 'owner' then 'owner'
    else 'cs'
  end;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    requested_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists content_items_touch_updated_at on public.content_items;
create trigger content_items_touch_updated_at
  before update on public.content_items
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists assessment_settings_touch_updated_at on public.assessment_settings;
create trigger assessment_settings_touch_updated_at
  before update on public.assessment_settings
  for each row execute function public.touch_updated_at();

alter table public.content_items enable row level security;
alter table public.progress enable row level security;
alter table public.activity_history enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.assessment_settings enable row level security;
alter table public.profiles enable row level security;

drop policy if exists content_items_select on public.content_items;
create policy content_items_select
  on public.content_items for select
  to authenticated
  using (true);

drop policy if exists content_items_write on public.content_items;
create policy content_items_write
  on public.content_items for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists progress_select on public.progress;
create policy progress_select
  on public.progress for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists progress_insert on public.progress;
create policy progress_insert
  on public.progress for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists progress_update on public.progress;
create policy progress_update
  on public.progress for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists progress_delete on public.progress;
create policy progress_delete
  on public.progress for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists activity_select on public.activity_history;
create policy activity_select
  on public.activity_history for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists activity_insert on public.activity_history;
create policy activity_insert
  on public.activity_history for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists attempts_select on public.assessment_attempts;
create policy attempts_select
  on public.assessment_attempts for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists attempts_insert on public.assessment_attempts;
create policy attempts_insert
  on public.assessment_attempts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists settings_select on public.assessment_settings;
create policy settings_select
  on public.assessment_settings for select
  to authenticated
  using (true);

drop policy if exists settings_update on public.assessment_settings;
create policy settings_update
  on public.assessment_settings for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id or public.is_owner());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id or public.is_owner())
  with check ((select auth.uid()) = id or public.is_owner());

revoke all on table public.content_items from anon;
revoke all on table public.progress from anon;
revoke all on table public.activity_history from anon;
revoke all on table public.assessment_attempts from anon;
revoke all on table public.assessment_settings from anon;
revoke all on table public.profiles from anon;

grant select, insert, update, delete on table public.content_items to authenticated;
grant select, insert, update, delete on table public.progress to authenticated;
grant select, insert on table public.activity_history to authenticated;
grant select, insert on table public.assessment_attempts to authenticated;
grant select, update on table public.assessment_settings to authenticated;
grant select on table public.profiles to authenticated;
revoke update on table public.profiles from authenticated;
grant update (full_name) on table public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  false,
  8388608,
  array['image/webp','image/jpeg','image/png']
)
on conflict (id) do nothing;

drop policy if exists product_images_select on storage.objects;
create policy product_images_select
  on storage.objects for select
  to authenticated
  using (bucket_id = 'product-images');

drop policy if exists product_images_insert on storage.objects;
create policy product_images_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images' and public.is_owner());

drop policy if exists product_images_update on storage.objects;
create policy product_images_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images' and public.is_owner())
  with check (bucket_id = 'product-images' and public.is_owner());

drop policy if exists product_images_delete on storage.objects;
create policy product_images_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images' and public.is_owner());
