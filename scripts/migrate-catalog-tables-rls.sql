-- scripts/migrate-catalog-tables-rls.sql
-- Habilitar RLS en tablas públicas de catálogo

-- 1. catalog_items
alter table public.catalog_items enable row level security;
drop policy if exists "Enable read access for authenticated users" on public.catalog_items;
drop policy if exists "public_read" on public.catalog_items;
drop policy if exists "public_insert" on public.catalog_items;
drop policy if exists "public_update" on public.catalog_items;
drop policy if exists "public_delete" on public.catalog_items;

create policy "Enable read access for authenticated users" 
on public.catalog_items for select to authenticated using (true);

-- 2. curtain_recipes
alter table public.curtain_recipes enable row level security;
drop policy if exists "Enable read access for authenticated users" on public.curtain_recipes;

create policy "Enable read access for authenticated users" 
on public.curtain_recipes for select to authenticated using (true);

-- 3. recipe_components
alter table public.recipe_components enable row level security;
drop policy if exists "Enable read access for authenticated users" on public.recipe_components;

create policy "Enable read access for authenticated users" 
on public.recipe_components for select to authenticated using (true);

-- 4. fabric_tone_rules
alter table public.fabric_tone_rules enable row level security;
drop policy if exists "Enable read access for authenticated users" on public.fabric_tone_rules;

create policy "Enable read access for authenticated users" 
on public.fabric_tone_rules for select to authenticated using (true);
