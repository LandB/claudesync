alter table public.conflict_log drop constraint conflict_log_losing_device_fkey;
alter table public.conflict_log drop constraint conflict_log_winning_device_fkey;

alter table public.conflict_log add constraint conflict_log_losing_device_fkey
  foreign key (losing_device) references public.devices(id) on delete set null;
alter table public.conflict_log add constraint conflict_log_winning_device_fkey
  foreign key (winning_device) references public.devices(id) on delete set null;
