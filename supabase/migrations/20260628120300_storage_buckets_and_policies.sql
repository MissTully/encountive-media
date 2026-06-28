-- Storage buckets (spec section 4): `assets` (source/library images) and
-- `renders` (finished carousels). Both private; access scoped per organization.
-- Convention: object paths are prefixed with the org id, e.g. "{org_id}/file.png".

insert into storage.buckets (id, name, public)
values ('assets', 'assets', false), ('renders', 'renders', false)
on conflict (id) do nothing;

create policy "org members read their bucket objects"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('assets', 'renders')
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

create policy "org members upload to their bucket folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('assets', 'renders')
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

create policy "org members update their bucket objects"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('assets', 'renders')
    and (storage.foldername(name))[1] = public.current_org_id()::text
  )
  with check (
    bucket_id in ('assets', 'renders')
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

create policy "org members delete their bucket objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('assets', 'renders')
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );
