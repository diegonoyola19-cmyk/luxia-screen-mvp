/**
 * supabaseRepository.ts
 * Capa de acceso a datos en Supabase.
 * Reemplaza la dependencia de archivos JSON locales y localStorage
 * para catálogo de items, recetas de cortina y reglas de tono.
 *
 * USO: importar las funciones que necesites desde este módulo.
 * No modifica ningún archivo existente — conéctalo cuando OneDrive sincronice.
 */

import { supabase } from './supabase';
import type {
  CatalogItem,
  CurtainRecipe,
  FabricToneRule,
  RecipeComponentRule,
  ToneGroup,
} from '../domain/curtains/types';

// ─── Tipos locales que mapean las tablas de Supabase ───────────────────────

interface DbCatalogItem {
  item_code: string;
  sage_item_code: string;
  description: string;
  category: string;
  color: string | null;
  unit: string;
  avg_cost: number;
  image_url: string | null;
}

interface DbRecipe {
  id: string;
  name: string;
  curtain_type: string;
  is_active: boolean;
}

interface DbRecipeComponent {
  id: string;
  recipe_id: string;
  label: string;
  category: string;
  quantity_mode: string;
  fixed_quantity: number;
  item_code_white: string | null;
  item_code_grey: string | null;
  item_code_ivory: string | null;
  item_code_bronze: string | null;
  sort_order: number;
}

interface DbFabricToneRule {
  family: string;
  openness: string;
  color: string;
  tone_group: string;
}

// ─── Mappers de DB → dominio ───────────────────────────────────────────────

function mapCatalogItem(row: DbCatalogItem): CatalogItem {
  return {
    itemCode:          row.item_code,
    sageItemCode:      row.sage_item_code,
    description:       row.description,
    category:          row.category as CatalogItem['category'],
    suggestedCategory: row.category as CatalogItem['category'],
    color:             row.color ?? undefined,
    suggestedColor:    row.color ?? undefined,
    unit:              row.unit,
    avgCost:           row.avg_cost,
    imageUrl:          row.image_url ?? undefined,
  };
}

function mapRecipeComponent(row: DbRecipeComponent): RecipeComponentRule {
  return {
    id:            row.id,
    label:         row.label,
    category:      row.category as RecipeComponentRule['category'],
    quantityMode:  row.quantity_mode as RecipeComponentRule['quantityMode'],
    fixedQuantity: row.fixed_quantity,
    itemByTone: {
      white:  row.item_code_white  ?? undefined,
      grey:   row.item_code_grey   ?? undefined,
      ivory:  row.item_code_ivory  ?? undefined,
      bronze: row.item_code_bronze ?? undefined,
    },
  };
}

function mapFabricToneRule(row: DbFabricToneRule): FabricToneRule {
  return {
    family:    row.family,
    openness:  row.openness,
    color:     row.color,
    toneGroup: row.tone_group as ToneGroup,
  };
}

// ─── Catálogo de items ─────────────────────────────────────────────────────

/**
 * Carga todos los items del catálogo desde Supabase.
 * Reemplaza la importación del archivo luxia-item-catalog.json.
 */
export async function fetchCatalogItems(): Promise<CatalogItem[]> {
  const { data, error } = await supabase
    .from('catalog_items')
    .select('*')
    .order('item_code');

  if (error) throw new Error(`Error cargando catálogo: ${error.message}`);
  return (data as DbCatalogItem[]).map(mapCatalogItem);
}

/**
 * Guarda un item del catálogo (crea o actualiza).
 */
export async function upsertCatalogItem(item: CatalogItem): Promise<void> {
  const { error } = await supabase.from('catalog_items').upsert({
    item_code:      item.itemCode,
    sage_item_code: item.sageItemCode,
    description:    item.description,
    category:       item.category,
    color:          item.color ?? null,
    unit:           item.unit,
    avg_cost:       item.avgCost,
    image_url:      item.imageUrl ?? null,
  });

  if (error) throw new Error(`Error guardando item: ${error.message}`);
}

/**
 * Actualiza la categoría de un item del catálogo.
 */
export async function updateCatalogItemCategory(
  itemCode: string,
  category: string,
): Promise<void> {
  const { error } = await supabase
    .from('catalog_items')
    .update({ category })
    .eq('item_code', itemCode);

  if (error) throw new Error(`Error actualizando categoría: ${error.message}`);
}

/**
 * Actualiza el color de un item del catálogo.
 */
export async function updateCatalogItemColor(
  itemCode: string,
  color: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('catalog_items')
    .update({ color: color || null })
    .eq('item_code', itemCode);

  if (error) throw new Error(`Error actualizando color: ${error.message}`);
}

/**
 * Actualiza el código Sage de un item del catálogo.
 */
export async function updateCatalogItemSageCode(
  itemCode: string,
  sageItemCode: string,
): Promise<void> {
  const { error } = await supabase
    .from('catalog_items')
    .update({ sage_item_code: sageItemCode })
    .eq('item_code', itemCode);

  if (error) throw new Error(`Error actualizando código Sage: ${error.message}`);
}

// ─── Recetas ───────────────────────────────────────────────────────────────

/**
 * Carga todas las recetas activas con sus componentes desde Supabase.
 */
export async function fetchRecipes(): Promise<CurtainRecipe[]> {
  const { data: recipesData, error: recipesError } = await supabase
    .from('curtain_recipes')
    .select('*')
    .eq('is_active', true)
    .order('created_at');

  if (recipesError) throw new Error(`Error cargando recetas: ${recipesError.message}`);

  const recipes = recipesData as DbRecipe[];

  if (recipes.length === 0) return [];

  const recipeIds = recipes.map((r) => r.id);
  const { data: componentsData, error: componentsError } = await supabase
    .from('recipe_components')
    .select('*')
    .in('recipe_id', recipeIds)
    .order('sort_order');

  if (componentsError) throw new Error(`Error cargando componentes: ${componentsError.message}`);

  const components = componentsData as DbRecipeComponent[];

  return recipes.map((recipe) => ({
    id:          recipe.id,
    name:        recipe.name,
    curtainType: recipe.curtain_type as CurtainRecipe['curtainType'],
    components:  components
      .filter((c) => c.recipe_id === recipe.id)
      .map(mapRecipeComponent),
  }));
}

/**
 * Guarda o actualiza una receta completa (receta + todos sus componentes).
 */
export async function upsertRecipe(recipe: CurtainRecipe): Promise<void> {
  // 1. Guardar cabecera de la receta
  const { error: recipeError } = await supabase.from('curtain_recipes').upsert({
    id:           recipe.id,
    name:         recipe.name,
    curtain_type: recipe.curtainType,
    is_active:    true,
    updated_at:   new Date().toISOString(),
  });

  if (recipeError) throw new Error(`Error guardando receta: ${recipeError.message}`);

  // 2. Borrar componentes anteriores y reinsertar
  const { error: deleteError } = await supabase
    .from('recipe_components')
    .delete()
    .eq('recipe_id', recipe.id);

  if (deleteError) throw new Error(`Error limpiando componentes: ${deleteError.message}`);

  if (recipe.components.length === 0) return;

  const componentRows = recipe.components.map((c, index) => ({
    id:               c.id,
    recipe_id:        recipe.id,
    label:            c.label,
    category:         c.category,
    quantity_mode:    c.quantityMode,
    fixed_quantity:   c.fixedQuantity,
    item_code_white:  c.itemByTone.white  ?? null,
    item_code_grey:   c.itemByTone.grey   ?? null,
    item_code_ivory:  c.itemByTone.ivory  ?? null,
    item_code_bronze: c.itemByTone.bronze ?? null,
    sort_order:       index,
  }));

  const { error: insertError } = await supabase
    .from('recipe_components')
    .insert(componentRows);

  if (insertError) throw new Error(`Error guardando componentes: ${insertError.message}`);
}

// ─── Reglas de tono de tela ────────────────────────────────────────────────

/**
 * Carga todas las reglas de tono de tela desde Supabase.
 */
export async function fetchFabricToneRules(): Promise<FabricToneRule[]> {
  const { data, error } = await supabase
    .from('fabric_tone_rules')
    .select('*');

  if (error) throw new Error(`Error cargando reglas de tono: ${error.message}`);
  return (data as DbFabricToneRule[]).map(mapFabricToneRule);
}

/**
 * Guarda o actualiza una regla de tono de tela.
 */
export async function upsertFabricToneRule(rule: FabricToneRule): Promise<void> {
  const { error } = await supabase.from('fabric_tone_rules').upsert({
    family:     rule.family,
    openness:   rule.openness,
    color:      rule.color,
    tone_group: rule.toneGroup,
  });

  if (error) throw new Error(`Error guardando regla de tono: ${error.message}`);
}

/**
 * Guarda múltiples reglas de tono en una sola operación.
 */
export async function upsertFabricToneRules(rules: FabricToneRule[]): Promise<void> {
  if (rules.length === 0) return;

  const rows = rules.map((rule) => ({
    family:     rule.family,
    openness:   rule.openness,
    color:      rule.color,
    tone_group: rule.toneGroup,
  }));

  const { error } = await supabase.from('fabric_tone_rules').upsert(rows);
  if (error) throw new Error(`Error guardando reglas de tono: ${error.message}`);
}
