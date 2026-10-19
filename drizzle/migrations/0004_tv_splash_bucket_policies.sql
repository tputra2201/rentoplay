create policy "tv_splash_select_auth" on storage.objects for select to authenticated using (bucket_id = 'tv-splash');
create policy "tv_splash_insert_auth" on storage.objects for insert to authenticated with check (bucket_id = 'tv-splash');
create policy "tv_splash_update_auth" on storage.objects for update to authenticated using (bucket_id = 'tv-splash') with check (bucket_id = 'tv-splash');
create policy "tv_splash_delete_auth" on storage.objects for delete to authenticated using (bucket_id = 'tv-splash');