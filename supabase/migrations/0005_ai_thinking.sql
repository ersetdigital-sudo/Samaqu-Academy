-- Idempotent and atomic: safe to run more than once. The column uses IF NOT
-- EXISTS and every UPDATE is guarded by a predicate that no longer matches
-- after the first run.

begin;

-- Per-feature thinking toggle. Empty object (default) means every feature is
-- disabled, which is the safe default for MiMo v2.6 (thinking is on by default
-- at the provider level) and keeps JSON output for the reviewer stable.
alter table public.ai_settings
  add column if not exists feature_thinking jsonb not null default '{}'::jsonb;

-- 'mimo-v2.6' is not a valid model ID. The v2.6 line is -pro / -flash /
-- -ultraspeed only. Map the invalid default to the cheapest valid model.
update public.ai_settings
set default_model = 'mimo-v2.6-flash'
where default_model = 'mimo-v2.6';

alter table public.ai_settings
  alter column default_model set default 'mimo-v2.6-flash'::text;

-- Rewrite feature_models entries that point at the invalid 'mimo-v2.6' ID.
-- Every CASE branch must produce jsonb: entry.value is jsonb, so the THEN
-- branch wraps its text literal with to_jsonb() instead of letting the CASE
-- result type coerce the literal to json.
update public.ai_settings
set feature_models = (
  select coalesce(
    jsonb_object_agg(
      entry.key,
      case
        when entry.value #>> '{}' = 'mimo-v2.6' then to_jsonb('mimo-v2.6-flash'::text)
        else entry.value
      end
    ),
    '{}'::jsonb
  )
  from jsonb_each(feature_models) as entry
)
where feature_models ? 'assistant'
   or feature_models ? 'reviewer'
   or feature_models ? 'simulator';

-- Drop stale mapping entries that point at a retired or invalid model so
-- resolveModel() falls back to default_model instead of calling a dead ID.
update public.ai_settings
set feature_models = (
  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
  from jsonb_each(feature_models) as entry
  where entry.value #>> '{}' not in (
    'mimo-v2.5',
    'mimo-v2.5-pro'
  )
)
where feature_models ?| array['assistant', 'reviewer', 'simulator'];

commit;
