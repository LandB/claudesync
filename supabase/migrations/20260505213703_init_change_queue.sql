create table public.change_queue (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  target_device uuid references public.devices(id) on delete cascade,
  file_path     text not null,
  operation     text not null check (operation in ('upsert', 'delete')),
  storage_path  text,
  hash          text,
  delivered     boolean not null default false,
  created_at    timestamptz not null default now(),
  delivered_at  timestamptz
);

create index change_queue_device_pending_idx
  on public.change_queue(target_device, delivered, created_at)
  where delivered = false;

create index change_queue_cleanup_idx on public.change_queue(delivered_at)
  where delivered = true;
