-- Seed the single organization for v1 (spec constraint #1).
-- Idempotent: only inserts if no organization named 'Encountive' exists.
insert into public.organizations (name)
select 'Encountive'
where not exists (
  select 1 from public.organizations where name = 'Encountive'
);
