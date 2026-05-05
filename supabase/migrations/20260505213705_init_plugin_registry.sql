create table public.plugin_registry (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  version          text not null,
  description      text,
  source           text not null check (source in ('npm', 'awesome-mcp', 'manual')),
  homepage_url     text,
  npm_package      text,
  weekly_downloads bigint default 0,
  last_fetched_at  timestamptz not null default now()
);

create index plugin_registry_name_idx on public.plugin_registry(name);
