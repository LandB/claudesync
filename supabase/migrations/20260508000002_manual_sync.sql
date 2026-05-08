-- Manual sync: replace change_queue with discovery_results, add last_discovered_at

-- Add discovery timestamp to devices
alter table public.devices add column if not exists last_discovered_at timestamptz;

-- Discovery results table (per-device diff of local vs server)
create table public.discovery_results (
  id           uuid primary key default gen_random_uuid(),
  device_id    uuid not null references public.devices(id) on delete cascade,
  file_path    text not null,
  local_hash   text,
  server_hash  text,
  status       text not null default 'discovered' check (status in ('discovered', 'sync_requested')),
  created_at   timestamptz not null default now()
);

create index discovery_results_device_idx on public.discovery_results(device_id);

alter table public.discovery_results enable row level security;

create policy "discovery_results_select_own" on public.discovery_results
  for select using (
    device_id in (select id from public.devices where user_id = auth.uid())
  );
create policy "discovery_results_insert_own" on public.discovery_results
  for insert with check (
    device_id in (select id from public.devices where user_id = auth.uid())
  );
create policy "discovery_results_update_own" on public.discovery_results
  for update using (
    device_id in (select id from public.devices where user_id = auth.uid())
  );
create policy "discovery_results_delete_own" on public.discovery_results
  for delete using (
    device_id in (select id from public.devices where user_id = auth.uid())
  );

-- Remove cron job that cleaned change_queue
select cron.unschedule('cleanup-queue');

-- Drop cleanup function for change_queue
drop function if exists public.cleanup_old_queue_events();

-- Drop change_queue
drop table if exists public.change_queue;
