-- Extend cleanup to also purge undelivered queue entries for devices
-- that haven't checked in for 7+ days. Those devices are gone/replaced
-- and their pending entries will never be consumed.
create or replace function public.cleanup_old_queue_events()
returns void language sql security definer
set search_path = ''
as $$
  delete from public.change_queue
  where delivered = true
    and delivered_at < now() - interval '30 days';

  delete from public.change_queue
  where delivered = false
    and target_device in (
      select id from public.devices
      where last_seen_at < now() - interval '7 days'
    );
$$;
