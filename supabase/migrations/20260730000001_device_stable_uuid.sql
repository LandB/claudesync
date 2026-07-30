-- Stable per-machine device identity.
--
-- hostname and mac_address are both volatile on macOS: DHCP hands out hostnames
-- that change with the network, and private Wi-Fi addresses rotate. Using either
-- as a device key made the same machine re-register as a new device. The agent
-- now persists a UUID in ~/.claudesync/device-id and sends it on every heartbeat.

alter table public.devices add column if not exists device_uuid text;

-- Deliberately not a partial index: ON CONFLICT inference (used by the heartbeat
-- upsert) cannot target a partial unique index. Legacy rows keep a null
-- device_uuid until an agent adopts them, and nulls never conflict with one
-- another, so multiple un-adopted rows remain legal.
create unique index if not exists devices_user_uuid_unique
  on public.devices(user_id, device_uuid);

-- Both old identity keys have to go. While they exist, a rotated MAC or a
-- flapped hostname turns a legitimate re-registration into a unique violation
-- (surfacing as a 500 from heartbeat) instead of an update.
alter table public.devices drop constraint if exists devices_user_hostname_unique;
drop index if exists public.devices_user_mac_unique;

-- Blocklist follows the same identity change.
alter table public.device_blocklist add column if not exists device_uuid text;

create unique index if not exists device_blocklist_uuid_idx
  on public.device_blocklist(user_id, device_uuid);

-- Blocking one machine must not fail because another machine once reported the
-- same hostname, or because the blocked machine's MAC was already recorded.
-- Both stay indexed for lookup, just no longer unique.
drop index if exists public.device_blocklist_hostname_idx;
drop index if exists public.device_blocklist_mac_idx;

create index if not exists device_blocklist_hostname_lookup
  on public.device_blocklist(user_id, hostname);
create index if not exists device_blocklist_mac_lookup
  on public.device_blocklist(user_id, mac_address);
