-- Izinkan biaya AI CS WhatsApp dicatat di ai_usage_logs.
alter table public.ai_usage_logs drop constraint if exists ai_usage_logs_feature_check;
alter table public.ai_usage_logs
  add constraint ai_usage_logs_feature_check
  check (feature in ('assistant', 'reviewer', 'simulator', 'admin_test', 'admin_models', 'wa'));
notify pgrst, 'reload schema';
