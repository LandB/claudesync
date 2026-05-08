-- Enable pg_cron (Supabase: requires superuser, enable via dashboard if this fails)
create extension if not exists pg_cron with schema pg_catalog;

-- Enable pg_net for HTTP calls from cron
create extension if not exists pg_net with schema extensions;

-- Grant cron usage to postgres role
grant usage on schema cron to postgres;
grant all on all tables in schema cron to postgres;

-- Daily cleanup of delivered queue events older than 30 days (3am UTC)
select cron.schedule(
  'cleanup-queue',
  '0 3 * * *',
  'select public.cleanup_old_queue_events()'
);

-- Hourly plugin registry refresh
-- SELF-HOSTING: replace YOUR_PROJECT_REF with your actual Supabase project ref
select cron.schedule(
  'refresh-plugins',
  '0 * * * *',
  $$
  select net.http_post(
    url      := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/refresh-plugins',
    headers  := '{"Content-Type":"application/json"}'::jsonb,
    body     := '{}'::jsonb
  )
  $$
);
