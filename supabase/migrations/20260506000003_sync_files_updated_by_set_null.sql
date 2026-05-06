alter table public.sync_files drop constraint sync_files_updated_by_fkey;
alter table public.sync_files add constraint sync_files_updated_by_fkey
  foreign key (updated_by) references public.devices(id) on delete set null;
