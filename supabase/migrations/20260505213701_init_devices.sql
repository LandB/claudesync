create table public.devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  name          text not null,
  hostname      text not null,
  platform      text not null,
  claude_path   text not null,
  agent_version text not null default '1.0.0',
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint devices_user_hostname_unique unique (user_id, hostname)
);

create index devices_user_id_idx on public.devices(user_id);
