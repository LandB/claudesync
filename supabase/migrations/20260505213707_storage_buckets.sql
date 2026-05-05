insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'claude-env',
  'claude-env',
  false,
  5242880,
  array['text/plain', 'text/markdown', 'application/json', 'application/zip']
);

create policy "storage_select_own" on storage.objects
  for select using (
    bucket_id = 'claude-env' and
    auth.uid()::text = (string_to_array(name, '/'))[1]
  );
create policy "storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'claude-env' and
    auth.uid()::text = (string_to_array(name, '/'))[1]
  );
create policy "storage_update_own" on storage.objects
  for update using (
    bucket_id = 'claude-env' and
    auth.uid()::text = (string_to_array(name, '/'))[1]
  );
create policy "storage_delete_own" on storage.objects
  for delete using (
    bucket_id = 'claude-env' and
    auth.uid()::text = (string_to_array(name, '/'))[1]
  );
