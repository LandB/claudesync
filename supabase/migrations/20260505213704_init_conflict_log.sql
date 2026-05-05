create table public.conflict_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  file_path       text not null,
  winning_device  uuid references public.devices(id),
  losing_device   uuid references public.devices(id),
  winning_hash    text not null,
  losing_hash     text not null,
  resolved        boolean not null default false,
  created_at      timestamptz not null default now()
);
