-- Fase 4B: Administrative user activity log.
-- Idempotent and safe to run more than once.

create table if not exists public.user_activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  actor_email text,
  target_user_id uuid references auth.users(id),
  target_email text,
  event_type text not null,
  event_label text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_activity_log_created_at
  on public.user_activity_log (created_at desc);

create index if not exists idx_user_activity_log_target_user_id
  on public.user_activity_log (target_user_id);

create index if not exists idx_user_activity_log_event_type
  on public.user_activity_log (event_type);

alter table public.user_activity_log enable row level security;

drop policy if exists "Authenticated can read user activity log" on public.user_activity_log;

drop policy if exists "Only service role can insert user activity log" on public.user_activity_log;
create policy "Only service role can insert user activity log"
on public.user_activity_log
for insert
to service_role
with check (true);
