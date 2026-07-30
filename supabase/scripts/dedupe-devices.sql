-- Merge duplicate device rows created before stable device_uuid identity.
--
-- DESTRUCTIVE. Run step 1 alone first and read the output. Only run step 2 once
-- the survivor/loser split looks right for your account.
--
-- Grouping key is the normalized hostname (lowercased, trailing ".local"
-- stripped), which is the closest thing to a machine identity the old rows have.
-- If two genuinely different machines share a hostname, this script would merge
-- them — check step 1's output for that before continuing.
--
-- The survivor is the oldest row per group. It keeps a null device_uuid, so the
-- next heartbeat from the upgraded agent adopts it and stamps the real id.

-- ── Step 1: preview ─────────────────────────────────────────────────────────
with ranked as (
  select
    id,
    user_id,
    hostname,
    mac_address,
    created_at,
    last_seen_at,
    row_number() over (
      partition by user_id, lower(regexp_replace(hostname, '\.local$', ''))
      order by created_at asc
    ) as rn
  from public.devices
  where device_uuid is null
)
select
  user_id,
  lower(regexp_replace(hostname, '\.local$', '')) as machine,
  case when rn = 1 then 'KEEP' else 'DELETE' end as action,
  id,
  hostname,
  mac_address,
  created_at,
  last_seen_at
from ranked
where exists (
  select 1 from ranked r2
  where r2.user_id = ranked.user_id
    and lower(regexp_replace(r2.hostname, '\.local$', ''))
        = lower(regexp_replace(ranked.hostname, '\.local$', ''))
    and r2.rn > 1
)
order by user_id, machine, rn;

-- ── Step 2: merge ───────────────────────────────────────────────────────────
-- Repoints history at the survivor, then deletes the duplicates. change_queue
-- and discovery_results rows cascade away with the losers — both hold transient
-- state that the next sync rebuilds.
--
-- begin;
--
-- create temp table device_merge as
-- with ranked as (
--   select
--     id,
--     user_id,
--     lower(regexp_replace(hostname, '\.local$', '')) as machine,
--     row_number() over (
--       partition by user_id, lower(regexp_replace(hostname, '\.local$', ''))
--       order by created_at asc
--     ) as rn
--   from public.devices
--   where device_uuid is null
-- )
-- select
--   loser.id  as loser_id,
--   winner.id as winner_id
-- from ranked loser
-- join ranked winner
--   on winner.user_id = loser.user_id
--  and winner.machine = loser.machine
--  and winner.rn = 1
-- where loser.rn > 1;
--
-- update public.sync_files f
--    set updated_by = m.winner_id
--   from device_merge m
--  where f.updated_by = m.loser_id;
--
-- update public.conflict_log c
--    set winning_device = m.winner_id
--   from device_merge m
--  where c.winning_device = m.loser_id;
--
-- update public.conflict_log c
--    set losing_device = m.winner_id
--   from device_merge m
--  where c.losing_device = m.loser_id;
--
-- -- Carry the most recent heartbeat onto the survivor so it does not look stale.
-- update public.devices d
--    set last_seen_at = greatest(d.last_seen_at, agg.max_seen),
--        agent_version = coalesce(agg.agent_version, d.agent_version)
--   from (
--     select m.winner_id,
--            max(l.last_seen_at) as max_seen,
--            (array_agg(l.agent_version order by l.last_seen_at desc))[1] as agent_version
--       from device_merge m
--       join public.devices l on l.id = m.loser_id
--      group by m.winner_id
--   ) agg
--  where d.id = agg.winner_id;
--
-- delete from public.devices
--  where id in (select loser_id from device_merge);
--
-- commit;
