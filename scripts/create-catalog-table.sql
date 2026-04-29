-- Run this in Supabase SQL Editor
-- https://supabase.com/dashboard/project/cisxgxttmfpxoslepybp/sql/new

create table if not exists catalog_items (
  item_code           text primary key,
  sage_item_code      text not null,
  description         text not null,
  unit                text not null,
  avg_cost            numeric(10,4) default 0,
  sale_price          numeric(10,4),
  image_url           text,
  category            text not null default 'other',
  suggested_category  text,
  color               text,
  suggested_color     text,
  updated_at          timestamptz default now()
);

-- Allow public read/write (no auth needed for production tablet)
alter table catalog_items enable row level security;

create policy if not exists "public_read" on catalog_items
  for select using (true);

create policy if not exists "public_insert" on catalog_items
  for insert with check (true);

create policy if not exists "public_update" on catalog_items
  for update using (true) with check (true);

create policy if not exists "public_delete" on catalog_items
  for delete using (true);
