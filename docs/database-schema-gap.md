# Brecha de Esquema de Base de Datos (Database Schema Gap)

Actualmente, el proyecto carece de una representación local completa y versionada del esquema de Supabase. El archivo `db_schema.sql` se encuentra vacío (0 bytes) y no existía el directorio `supabase/migrations/` con el historial de la base.

## Qué falta exactamente

Para poder levantar un entorno local de Supabase (`supabase start`) o auditar correctamente el proyecto desde cero, se requieren los DDL completos de las siguientes entidades que existen en remoto pero no en código:

1. **Tablas Core:**
   - `public.work_orders`
   - `public.inventory_items`
   - `public.profiles` / tabla de manejo de usuarios

2. **Funciones y Triggers Base:**
   - La función `public.has_permission(uuid, text)` utilizada para RBAC (Role-Based Access Control) en las policies RLS.
   - Cualquier trigger asociado a perfiles (por ejemplo, triggers en `auth.users` que copian datos a `public.profiles`).

3. **Políticas RLS Base:**
   - Las políticas RLS actuales de inventario y órdenes que protegen las mutaciones (vistas en logs como errores `42501 PermissionError`).

4. **Datos Semilla (Seed Data):**
   - Catálogos estáticos como roles, permisos base, o items de inventario de prueba que asumen los tests.

## Instrucciones para corregir la brecha

1. Descargar el esquema actual del proyecto remoto:
   ```bash
   supabase db pull
   ```
   *O alternativamente, generar un volcado del esquema usando pg_dump en el servidor remoto.*

2. Guardar el esquema descargado como la migración inicial:
   `supabase/migrations/20260706000000_initial_schema.sql`

3. A partir de entonces, cualquier alteración adicional (como la nueva tabla `inventory_reservations`) debe estar conectada a través de un nuevo archivo en la misma carpeta.
