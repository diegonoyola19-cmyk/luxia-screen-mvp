import { execSync } from 'child_process';

const TABLES = [
  'catalog_items',
  'curtain_recipes',
  'recipe_components',
  'fabric_tone_rules'
];

function runQuery(sql) {
  try {
    // Escapar comillas dobles y usar JSON para la salida para poder validarlo o parsearlo
    const cmd = `npx supabase db query "${sql.replace(/"/g, '\\"')}" --linked --output json`;
    const stdout = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    const jsonStr = stdout.substring(stdout.indexOf('{'), stdout.lastIndexOf('}') + 1);
    return JSON.parse(jsonStr).rows;
  } catch (error) {
    // Si supabase db query falla a nivel CLI (por ej. sintaxis), execSync tira excepción
    return null;
  }
}

function runQueryRaw(sql) {
  try {
    const cmd = `npx supabase db query "${sql.replace(/"/g, '\\"')}" --linked`;
    const stdout = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    return stdout;
  } catch (error) {
    return error.stdout ? error.stdout.toString() : error.message;
  }
}

console.log('--- Iniciando prueba de RLS en Catálogos mediante SQL ---');

// 1. Verificar RLS enabled
console.log('\n1. Verificando RLS Enabled en pg_tables...');
const rlsQuery = `
select tablename, rowsecurity 
from pg_tables 
where schemaname = 'public' 
and tablename in ('catalog_items', 'curtain_recipes', 'recipe_components', 'fabric_tone_rules');
`;
const rlsResult = runQuery(rlsQuery);
if (rlsResult && rlsResult.length > 0) {
  rlsResult.forEach(row => {
    console.log(`Tabla: ${row.tablename} | RLS: ${row.rowsecurity}`);
  });
} else {
  console.log('No se obtuvieron resultados de pg_tables.');
}

// 2. Verificar policies
console.log('\n2. Verificando Policies en pg_policies...');
const policiesQuery = `
select tablename, policyname, roles, cmd 
from pg_policies 
where schemaname = 'public' 
and tablename in ('catalog_items', 'curtain_recipes', 'recipe_components', 'fabric_tone_rules') 
order by tablename, policyname;
`;
const policiesResult = runQuery(policiesQuery);
if (policiesResult && policiesResult.length > 0) {
  policiesResult.forEach(row => {
    // format arrays correctly for output
    const roles = Array.isArray(row.roles) ? row.roles.join(',') : row.roles;
    console.log(`Tabla: ${row.tablename} | Policy: ${row.policyname} | Roles: ${roles} | Cmd: ${row.cmd}`);
  });
} else {
  console.log('No se encontraron policies en pg_policies.');
}

// 3. Verificar anon
console.log('\n3. Verificando acceso de lectura para rol: anon...');
for (const table of TABLES) {
  const q = `begin; set local role anon; select count(*) from public.${table}; rollback;`;
  const res = runQueryRaw(q);
  if (res.includes('permission denied')) {
    console.log(`✅ [Anon] Bloqueado SELECT en ${table} (Esperado)`);
  } else if (res.includes('count')) {
    // Puede que devuelva rows vacías si la policy existe y evalúa a false
    const parsed = runQuery(q);
    if (parsed && parsed.length > 0) {
        console.log(`✅ [Anon] SELECT permitido en ${table} devolvió count: ${parsed[0].count}`);
    } else {
        console.log(`✅ [Anon] SELECT en ${table} bloqueado por RLS (devuelve vacío).`);
    }
  } else {
    console.log(`⚠️ Resultado inesperado para anon en ${table}: \n${res.substring(0, 100)}`);
  }
}

// 4. Verificar authenticated
console.log('\n4. Verificando acceso de lectura para rol: authenticated...');
for (const table of TABLES) {
  const q = `begin; set local role authenticated; select count(*) from public.${table}; rollback;`;
  const res = runQuery(q);
  if (res && res.length > 0) {
    console.log(`✅ [Auth] SELECT permitido en ${table}. Filas: ${res[0].count}`);
  } else {
    console.log(`❌ [Auth] ERROR: No se pudieron leer filas en ${table}`);
  }
}

// 5. Verificar authenticated insert
console.log('\n5. Verificando bloqueo de escritura para rol: authenticated...');
for (const table of TABLES) {
  // Try inserting dummy data inside a transaction
  let insertQuery = '';
  if (table === 'catalog_items') {
    insertQuery = `insert into public.catalog_items (item_code, category, description, unit, avg_cost) values ('TEST-1', 'other', 'Test', 'm', 0)`;
  } else if (table === 'curtain_recipes') {
    insertQuery = `insert into public.curtain_recipes (id, name, curtain_type) values ('00000000-0000-0000-0000-000000000000', 'Test', 'roller')`;
  } else if (table === 'recipe_components') {
    insertQuery = `insert into public.recipe_components (id, recipe_id, label, category, quantity_mode) values ('test', '00000000-0000-0000-0000-000000000000', 'Test', 'other', 'fixed')`;
  } else if (table === 'fabric_tone_rules') {
    insertQuery = `insert into public.fabric_tone_rules (family, openness, color, tone_group) values ('T', 'T', 'T', 'white')`;
  }

  const q = `begin; set local role authenticated; ${insertQuery}; rollback;`;
  const res = runQueryRaw(q);
  if (res.includes('permission denied') || res.includes('new row violates row-level security policy')) {
    console.log(`✅ [Auth] Bloqueado INSERT en ${table} (Esperado)`);
  } else {
    console.log(`❌ [Auth] ERROR: INSERT no fue bloqueado en ${table} o el error fue otro: \n${res.substring(0, 100)}`);
  }
}

console.log('\n--- Pruebas RLS SQL finalizadas ---');
