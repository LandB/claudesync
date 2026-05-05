create or replace function public.cleanup_old_queue_events()
returns void language sql security definer
set search_path = ''
as $$
  delete from public.change_queue
  where delivered = true
    and delivered_at < now() - interval '30 days';
$$;
