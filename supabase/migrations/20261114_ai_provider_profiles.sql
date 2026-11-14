-- Profil provider AI: Xiaomi MiMo (langsung), Command Code, dan Custom.
--
-- ADITIF dan IDEMPOTEN: hanya MENAMBAH satu tabel dan satu fungsi. Tabel/kolom lama tidak diubah.
-- `ai_settings` tetap SATU-SATUNYA sumber yang dibaca fungsi AI (ai, ai-admin, wa-agent), jadi kode
-- runtime tidak berubah. Profil yang dipilih "aktif" disalin ke `ai_settings` oleh
-- `activate_ai_profile()` dalam SATU transaksi (tidak ada jeda Base URL sudah baru tapi model masih lama).
--
-- Kunci API tiap profil disimpan terenkripsi (AES-GCM) dengan format yang sama dengan `ai_settings`,
-- jadi bisa disalin apa adanya tanpa didekripsi. Rollback: supabase/rollback/20261114_ai_provider_profiles_rollback.sql

begin;

create table if not exists public.ai_provider_profiles (
  id text primary key check (id in ('xiaomi', 'commandcode', 'custom')),
  label text not null,
  base_url text not null default '',
  api_key_ciphertext text,
  api_key_iv text,
  api_key_last4 text,
  default_model text not null default '',
  feature_models jsonb not null default '{}'::jsonb,
  pricing jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- Paling banyak SATU profil aktif.
create unique index if not exists ai_provider_profiles_one_active
  on public.ai_provider_profiles ((true))
  where is_active;

drop trigger if exists ai_provider_profiles_touch_updated_at on public.ai_provider_profiles;
create trigger ai_provider_profiles_touch_updated_at
  before update on public.ai_provider_profiles
  for each row execute function public.touch_updated_at();

-- Seperti ai_settings: hanya service role (Edge Function) yang boleh membaca/menulis.
alter table public.ai_provider_profiles enable row level security;
revoke all on table public.ai_provider_profiles from anon, authenticated;

-- Salin profil `p_id` ke ai_settings dan tandai sebagai aktif, ATOMIK.
-- Ditolak bila profil tidak ada, belum punya API Key, atau Base URL / model kosong.
create or replace function public.activate_ai_profile(p_id text, p_user uuid default null)
returns void
language plpgsql
set search_path = public
as $$
declare
  p public.ai_provider_profiles%rowtype;
begin
  select * into p from public.ai_provider_profiles where id = p_id for update;
  if not found then
    raise exception 'Profil % tidak ditemukan', p_id;
  end if;
  if p.api_key_ciphertext is null or p.api_key_iv is null then
    raise exception 'Profil % belum punya API Key', p_id;
  end if;
  if btrim(p.base_url) = '' or btrim(p.default_model) = '' then
    raise exception 'Profil % belum lengkap (Base URL atau model kosong)', p_id;
  end if;

  update public.ai_settings
  set provider = case p.id when 'xiaomi' then 'xiaomi-mimo' when 'commandcode' then 'command-code' else 'custom' end,
      base_url = p.base_url,
      api_key_ciphertext = p.api_key_ciphertext,
      api_key_iv = p.api_key_iv,
      api_key_last4 = p.api_key_last4,
      default_model = p.default_model,
      feature_models = p.feature_models,
      pricing = p.pricing,
      updated_by = p_user
  where id = 1;
  if not found then
    raise exception 'Baris ai_settings (id = 1) tidak ada';
  end if;

  -- Urutan penting: indeks unik "satu profil aktif" diperiksa per baris, jadi matikan yang lama DULU,
  -- baru aktifkan yang dipilih. Keduanya dalam satu transaksi fungsi ini (atomik).
  update public.ai_provider_profiles set is_active = false where is_active and id <> p_id;
  update public.ai_provider_profiles set is_active = true, last_active_at = now() where id = p_id;
end;
$$;

revoke all on function public.activate_ai_profile(text, uuid) from public, anon, authenticated;
grant execute on function public.activate_ai_profile(text, uuid) to service_role;

-- Isi awal (sekali saja): tiga profil bawaan; yang cocok dengan ai_settings SEKARANG mewarisi
-- Base URL, kunci, model, dan harga-nya dan menjadi aktif.
do $$
declare
  s public.ai_settings%rowtype;
  target text;
  fixed_model text;
begin
  if exists (select 1 from public.ai_provider_profiles) then
    return;
  end if;

  insert into public.ai_provider_profiles (id, label, base_url, default_model) values
    ('xiaomi', 'Xiaomi MiMo (langsung)', 'https://api.xiaomimimo.com/v1', 'mimo-v2.6-pro'),
    ('commandcode', 'Command Code', 'https://api.commandcode.ai/provider/v1', 'xiaomi/mimo-v2.6-flash'),
    ('custom', 'Custom (kompatibel OpenAI)', '', '');

  select * into s from public.ai_settings where id = 1;
  if not found then
    return;
  end if;

  target := case
    when s.base_url ilike '%commandcode.ai%' then 'commandcode'
    when s.base_url ilike '%xiaomimimo.com%' then 'xiaomi'
    else 'custom'
  end;

  -- Command Code hanya menerima id berawalan penyedia (xiaomi/mimo-v2.6-flash); nama tanpa awalan
  -- (mis. 'mimo-v2.6-flash', bawaan migrasi 0005) ditolak 400 "not supported".
  fixed_model := case
    when target = 'commandcode' and position('/' in s.default_model) = 0 then 'xiaomi/' || s.default_model
    else s.default_model
  end;

  update public.ai_provider_profiles
  set base_url = s.base_url,
      api_key_ciphertext = s.api_key_ciphertext,
      api_key_iv = s.api_key_iv,
      api_key_last4 = s.api_key_last4,
      default_model = fixed_model,
      feature_models = coalesce(s.feature_models, '{}'::jsonb),
      pricing = coalesce(s.pricing, '{}'::jsonb),
      is_active = true,
      last_active_at = now()
  where id = target;

  -- Samakan ai_settings dengan profil aktif (memperbaiki nama model di atas); hanya bila ada kunci.
  if s.api_key_ciphertext is not null and s.api_key_iv is not null and btrim(s.base_url) <> '' then
    perform public.activate_ai_profile(target, null);
  end if;
end;
$$;

commit;
