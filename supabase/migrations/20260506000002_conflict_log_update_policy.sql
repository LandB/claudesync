create policy "conflict_log_update_own" on public.conflict_log
  for update using (auth.uid() = user_id);
