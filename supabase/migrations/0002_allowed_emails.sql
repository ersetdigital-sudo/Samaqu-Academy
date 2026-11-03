-- Restrict new auth users to an explicit allowlist.
-- Existing users are unaffected; service-role/admin-created users must also be listed.

create table if not exists public.allowed_emails (
  email text primary key,
  role text not null default 'cs' check (role in ('owner','cs')),
  created_at timestamptz not null default now()
);

alter table public.allowed_emails enable row level security;
revoke all on table public.allowed_emails from anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_role text;
begin
  select a.role into allowed_role
  from public.allowed_emails a
  where lower(a.email) = lower(coalesce(new.email, ''));

  if allowed_role is null then
    raise exception 'Email belum diizinkan untuk Samaqu CS Academy';
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    allowed_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
