alter table public.profiles        enable row level security;
alter table public.devices         enable row level security;
alter table public.sync_files      enable row level security;
alter table public.change_queue    enable row level security;
alter table public.conflict_log    enable row level security;
alter table public.plugin_registry enable row level security;

-- profiles
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- devices
create policy "devices_select_own" on public.devices
  for select using (auth.uid() = user_id);
create policy "devices_insert_own" on public.devices
  for insert with check (auth.uid() = user_id);
create policy "devices_update_own" on public.devices
  for update using (auth.uid() = user_id);
create policy "devices_delete_own" on public.devices
  for delete using (auth.uid() = user_id);

-- sync_files
create policy "sync_files_select_own" on public.sync_files
  for select using (auth.uid() = user_id);
create policy "sync_files_insert_own" on public.sync_files
  for insert with check (auth.uid() = user_id);
create policy "sync_files_update_own" on public.sync_files
  for update using (auth.uid() = user_id);
create policy "sync_files_delete_own" on public.sync_files
  for delete using (auth.uid() = user_id);

-- change_queue
create policy "change_queue_select_own" on public.change_queue
  for select using (auth.uid() = user_id);
create policy "change_queue_insert_own" on public.change_queue
  for insert with check (auth.uid() = user_id);
create policy "change_queue_update_own" on public.change_queue
  for update using (auth.uid() = user_id);

-- conflict_log
create policy "conflict_log_select_own" on public.conflict_log
  for select using (auth.uid() = user_id);

-- plugin_registry: public read, service role writes
create policy "plugin_registry_read_all" on public.plugin_registry
  for select using (true);
