-- Rollback 20261114_ai_provider_profiles.sql
--
-- Hanya membuang fungsi dan tabel profil. `ai_settings` TIDAK disentuh: ia tetap berisi pengaturan
-- terakhir yang disalin dari profil aktif (Base URL, kunci, model), jadi bot terus berjalan dengan
-- provider yang sedang aktif. Setelah rollback, halaman Pengaturan AI otomatis kembali ke tampilan lama
-- (profilesReady = false).

begin;

drop function if exists public.activate_ai_profile(text, uuid);
drop table if exists public.ai_provider_profiles;

commit;
