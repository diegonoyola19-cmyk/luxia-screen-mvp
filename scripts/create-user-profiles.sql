-- Run this in Supabase SQL Editor
-- https://supabase.com/dashboard/project/cisxgxttmfpxoslepybp/sql/new

-- 1. Create custom enum type for roles if it doesn't exist
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role_type') then
    create type user_role_type as enum ('admin', 'produccion', 'bodega', 'consulta');
  end if;
end
$$;

-- 2. Create the profiles table linked to auth.users
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  role user_role_type not null default 'consulta',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;

-- 4. Set RLS Policies
-- Allow anyone authenticated to read their own profile row
create policy "Allow users to read their own profile" on public.profiles
  for select using (auth.uid() = id);

-- Allow admins full access to profiles
create policy "Allow admins to read all profiles" on public.profiles
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Allow admins to insert profiles" on public.profiles
  for insert with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Allow admins to update profiles" on public.profiles
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  ) with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Allow admins to delete profiles" on public.profiles
  for delete using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 5. Trigger to automatically create a profile row for new auth.users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role, is_active)
  values (new.id, new.email, 'consulta', true); -- default role 'consulta', active by default
  return new;
end;
$$ language plpgsql security definer;

-- Recreate trigger if exists or create new
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 6. Helper query to backfill profiles for existing users (run manually if needed)
-- insert into public.profiles (id, email, role, is_active)
-- select id, email, 'consulta', true from auth.users
-- on conflict (id) do nothing;
