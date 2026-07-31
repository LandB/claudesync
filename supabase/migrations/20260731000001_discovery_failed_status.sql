-- A push that fails mid-sync used to vanish: the agent swallowed the error and
-- sync-complete deleted every pending row for the device regardless. Give the
-- row somewhere to survive, and somewhere to say why.

alter table public.discovery_results
  drop constraint if exists discovery_results_status_check;

alter table public.discovery_results
  add constraint discovery_results_status_check
  check (status in ('discovered', 'sync_requested', 'failed'));

alter table public.discovery_results
  add column if not exists error text;
