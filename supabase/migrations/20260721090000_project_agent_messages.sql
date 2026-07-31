-- Creative Director agent conversations: each project carries a chat with a
-- Gemini-powered design agent that gives art direction, instructions, and
-- recommendations grounded in the project's moodboard and brand voice
-- (src/lib/gemini.ts askCreativeDirector, src/app/projects/actions.ts).

create table public.project_agent_messages (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  role        text not null check (role in ('user', 'agent')),
  body        text not null check (length(trim(body)) > 0),
  created_at  timestamptz not null default now()
);
create index project_agent_messages_project_id_idx
  on public.project_agent_messages (project_id, created_at);

alter table public.project_agent_messages enable row level security;

-- Scoped via projects -> org, same as project_assets.
create policy "org members manage project_agent_messages"
  on public.project_agent_messages for all to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = project_agent_messages.project_id
      and p.org_id = public.current_org_id()
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = project_agent_messages.project_id
      and p.org_id = public.current_org_id()
  ));
