-- mac_address column on devices
alter table public.devices add column mac_address text;
create unique index devices_user_mac_unique on public.devices(user_id, mac_address) where mac_address is not null;

-- device blocklist
create table public.device_blocklist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  mac_address text,
  hostname    text not null,
  blocked_at  timestamptz not null default now()
);
create unique index device_blocklist_mac_idx      on public.device_blocklist(user_id, mac_address) where mac_address is not null;
create unique index device_blocklist_hostname_idx on public.device_blocklist(user_id, hostname);

alter table public.device_blocklist enable row level security;
create policy "blocklist_select_own" on public.device_blocklist for select using (auth.uid() = user_id);
create policy "blocklist_insert_own" on public.device_blocklist for insert with check (auth.uid() = user_id);
create policy "blocklist_delete_own" on public.device_blocklist for delete using (auth.uid() = user_id);
