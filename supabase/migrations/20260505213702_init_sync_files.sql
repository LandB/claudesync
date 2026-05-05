create table public.sync_files (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  path         text not null,
  size_bytes   bigint not null default 0,
  hash         text not null,
  storage_path text not null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.devices(id),
  deleted      boolean not null default false,
  constraint sync_files_user_path_unique unique (user_id, path)
);

create index sync_files_user_id_idx on public.sync_files(user_id);
create index sync_files_updated_at_idx on public.sync_files(updated_at desc);
