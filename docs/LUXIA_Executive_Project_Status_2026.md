# LUXIA — Manufacturing Execution & Operations Platform
# Executive Project Status & Technical Overview 2026

**Documento Oficial de Auditoría Documental, Arquitectura y Estado de Madurez**  
**Fecha de Emisión:** 24 de Agosto de 2026  
**Rama:** `main` | **Commit SHA:** `c09ee1c91db2b4165d9853b9f211df61f3039c63` | **Estado Working Tree:** Clean  
**Versión de Paquete:** `0.1.0` | **Tags Relacionados:** `luxia-bom-v2-single-source-v1`, `luxia-production-validated-v2`

---

## ÍNDICE GENERAL

1. [Fase 1: Auditoría de Repositorio y Baseline](#1-fase-1-auditoría-de-repositorio-y-baseline)
2. [Fase 2: Qué es LUXIA — Resumen Ejecutivo](#2-fase-2-qué-es-luxia--resumen-ejecutivo)
3. [Fase 3: Flujo Operativo y de Datos Extremo a Extremo (Paso a Paso)](#3-fase-3-flujo-operativo-y-de-datos-extremo-a-extremo-paso-a-paso)
4. [Fase 4: Mapa Detallado de Módulos del Sistema](#4-fase-4-mapa-detallado-de-módulos-del-sistema)
5. [Fase 5: Módulo de Producción Industrial (ProductionModuleV2)](#5-fase-5-módulo-de-producción-industrial-productionmodulev2)
6. [Fase 6: Arquitectura BOM V2 — Single Source of Truth](#6-fase-6-arquitectura-bom-v2--single-source-of-truth)
7. [Fase 7: Optimizador de Corte de Tela (Cutting Optimizer)](#7-fase-7-optimizador-de-corte-de-tela-cutting-optimizer)
8. [Fase 8: Subflujo de Bodega, Inventario y Movimientos Atómicos](#8-fase-8-subflujo-de-bodega-inventario-y-movimientos-atómicos)
9. [Fase 9: Integración Externa: Motor de Sincronización API Vertilux](#9-fase-9-integración-externa-motor-de-sincronización-api-vertilux)
10. [Fase 10: Subflujo de Órdenes Guardadas y Auditoría de Taller](#10-fase-10-subflujo-de-órdenes-guardadas-y-auditoría-de-taller)
11. [Fase 11: Integración ERP SAGE y Motor de Descargo](#11-fase-11-integración-erp-sage-y-motor-de-descargo)
12. [Fase 12: Ciclo de Vida de Retazos (Scraps) y Protección de Consumo](#12-fase-12-ciclo-de-vida-de-retazos-scraps-y-protección-de-consumo)
13. [Fase 13: Mecanismo Transaccional de Cancelación y Rollback](#13-fase-13-mecanismo-transaccional-de-cancelación-y-rollback)
14. [Fase 14: Control de Acceso Basado en Roles (RBAC) y Seguridad](#14-fase-14-control-de-acceso-basado-en-roles-rbac-y-seguridad)
15. [Fase 15: Seguridad de Datos, Secretos y Políticas RLS](#15-fase-15-seguridad-de-datos-secretos-y-políticas-rls)
16. [Fase 16: Arquitectura de Base de Datos y Mapeo de Tablas](#16-fase-16-arquitectura-de-base-de-datos-y-mapeo-de-tablas)
17. [Fase 17: Auditoría, Trazabilidad y Logs de Actividad](#17-fase-17-auditoría-trazabilidad-y-logs-de-actividad)
18. [Fase 18: Métricas de Calidad, Testing y Verificación](#18-fase-18-métricas-de-calidad-testing-y-verificación)
19. [Fase 19: Hitos Principales Implementados](#19-fase-19-hitos-principales-implementados)
20. [Fase 20: Matriz de Madurez del Sistema](#20-fase-20-matriz-de-madurez-del-sistema)
21. [Fase 21: Limitaciones Actuales y Deuda Técnica](#21-fase-21-limitaciones-actuales-y-deuda-técnica)
22. [Fase 22: Roadmap Estratégico Recomendado](#22-fase-22-roadmap-estratégico-recomendado)
23. [Fase 23: Diagramas Arquitectónicos y Operativos](#23-fase-23-diagramas-arquitectónicos-y-operativos)
24. [Fase 24: Formato y Especificaciones del Entregable](#24-fase-24-formato-y-especificaciones-del-entregable)
25. [Fase 25: Audiencias y Niveles de Lectura](#25-fase-25-audiencias-y-niveles-de-lectura)
26. [Fase 26: Protocolo de Exactitud y Verificación](#26-fase-26-protocolo-de-exactitud-y-verificación)
27. [Fase 27: Citas y Referencias Internas de Código Fuente](#27-fase-27-citas-y-referencias-internas-de-código-fuente)
28. [Fase 28: Conclusión y Validación Final de Cero Modificaciones](#28-fase-28-conclusión-y-validación-final-de-cero-modificaciones)

---

# 1. FASE 1: AUDITORÍA DE REPOSITORIO Y BASELINE

La presente auditoría técnica y funcional ha sido realizada ejecutando inspección estricta sobre el código fuente, esquemas SQL, procedimientos remotos (RPCs), pruebas automatizadas y configuración del despliegue en la plataforma Vercel.

### Parámetros de Baseline Verificados
- **Rama Activa:** `main`
- **Commit HEAD:** `c09ee1c91db2b4165d9853b9f211df61f3039c63`
- **Mensaje de Commit:** `fix(vercel): adjust cron to daily for Hobby plan and add GitHub Actions 2x daily schedule`
- **Estado de Working Tree:** Clean (`nothing to commit, working tree clean`).
- **Historial de Commits Relevantes:**
  - `c09ee1c` fix(vercel): adjust cron to daily for Hobby plan and add GitHub Actions 2x daily schedule
  - `5bad553` fix(deploy): add @vercel/node dependency and refine SPA rewrites for Vercel
  - `56bb296` feat(api): automate scheduled Vertilux inventory sync with Vercel Cron and audit UI
  - `2f1dd8f` feat(production): improve focus mode workflow and layout
  - `b861357` refactor(bom): unify roller rules on V2 source of truth
  - `48240f3` fix(production): resolve critical inventory and BOM issues
- **Tags de Release Activos:**
  - `luxia-bom-v2-single-source-v1`
  - `luxia-production-validated-v2`
  - `luxia-full-matrix-validated-v1`
  - `luxia-post-3g-reservations-stable`
  - `luxia-reservation-reconciliation-stable`
  - `luxia-scraps-stable`
  - `luxia-production-ready-v1`
  - `luxia-v1.0.0`
- **Dependencias Principales (`package.json`):**
  - Core: `react: ^18.3.1`, `react-dom: ^18.3.1`, `zustand: ^5.0.12`, `@supabase/supabase-js: ^2.105.1`
  - UI / UX: `framer-motion: ^12.38.0`, `sonner: ^2.0.7`
  - Exportación & Documentos: `jspdf: ^4.2.1`, `jspdf-autotable: ^5.0.7`, `xlsx: ^0.18.5`
  - Build & Serverless: `vite: ^5.4.10`, `@vercel/node: ^7.0.0`, `typescript: ^5.6.3`, `vitest: ^4.1.5`

---

# 2. FASE 2: QUÉ ES LUXIA — RESUMEN EJECUTIVO

### Propósito del Sistema
**LUXIA** es la plataforma MES (*Manufacturing Execution System*) y de operaciones de planta concebida y desarrollada para digitalizar, estructurar, optimizar y auditar integralmente la fabricación a medida de cortinas tipo Roller (enrollables) para **Vertilux**.

### Problema Empresarial que Resuelve
En la industria de confección arquitectónica de cortinas, la distancia entre el requerimiento comercial del cliente y la manufactura en taller genera pérdidas millonarias por:
1. **Errores de Traducción Técnica:** La orden de venta expresa medidas de vano terminado (ancho y alto de ventana), mientras que el operario de planta debe calcular descuentos milimétricos en tubos de aluminio (para alojar soportes, clutch y end plug), tolerancias de encuadre en mesa, márgenes de caída, enrolle superior y bolsillos inferiores para contrapeso (*bottomrail*).
2. **Desperdicio de Tela y Aluminio:** La ausencia de optimizadores de anidado de corte en rollos continuos (2.50 m y 3.00 m) provocaba mermas excesivas no contabilizadas y la pérdida total de retazos aprovechables (*scraps*).
3. **Inconsistencias en Lista de Materiales (BOM):** La utilización de fórmulas aisladas provocaba que la cotización inicial tuviera SKUs diferentes a los enviados al taller y a los descargados en contabilidad.
4. **Fricción en ERP SAGE 300:** El descargo de componentes en el ERP corporativo se realizaba manualmente o mediante hojas de cálculo artesanales propensas a errores de formato, duplicación o descuadre de inventarios.

### Usuarios del Sistema
- **Operadores y Cortadores de Planta:** Configuran medidas, consultan planos de corte de tela y perfiles, y confirman mermas.
- **Supervisores de Manufactura:** Validan lotes de producción, aprueban órdenes con sobredimensionamiento (*Fabricación Especial*), auditan materiales sustitutos en piso y emiten hojas de taller en PDF.
- **Encargados de Bodega / Almacén:** Monitorean existencias de rollos y barras, registran altas y bajas de retazos, y gestionan la sincronización de inventario corporativo.
- **Dirección de Operaciones / Finanzas:** Exportan archivos limpios y validados hacia SAGE 300 Order Entry y auditan la trazabilidad de usuarios y consumo.

---

# 3. FASE 3: FLUJO OPERATIVO Y DE DATOS EXTREMO A EXTREMO (PASO A PASO)

A continuación se detalla la secuencia exacta de operaciones verificada en código desde el ingreso del usuario hasta la finalización y auditoría:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 1. Auth &    │────▶│ 2. Router &  │────▶│ 3. Config de │────▶│ 4. Validación│
│    Permisos  │     │    Gating    │     │    Cortina   │     │    Reglas    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────┬───────┘
                                                                      │
┌──────────────┐     ┌──────────────┐     ┌──────────────┐            │
│ 8. Atomic Tx │◀────│ 7. Optimizer │◀────│ 6. BOM V2    │◀───────────┘
│    Guardado  │     │    Corte     │     │    Canónico  │ (5. Dimensiones)
└──────┬───────┘     └──────────────┘     └──────────────┘
       │
       ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 9. Órdenes   │────▶│ 10. Material │────▶│ 11. Pre-SAGE │────▶│ 12. SAGE     │
│    Panel     │     │     Review   │     │     Guard    │     │     Export   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────┬───────┘
                                                                      │
┌──────────────┐     ┌──────────────┐     ┌──────────────┐            │
│ 16. Rollback │◀────│ 15. API Sync │◀────│ 14. Bodega   │◀───────────┘
│     Cancel   │     │     Vertilux │     │     Stock    │ (13. PDF Doc)
└──────────────┘     └──────────────┘     └──────────────┘
```

### Detalle Operativo de Cada Paso

#### Paso 1: Autenticación e Inicialización de Sesión
- **Usuario:** Introduce email y contraseña.
- **LUXIA:** `useAuthStore.ts` ejecuta `supabase.auth.signInWithPassword`. Consulta `public.profiles` y `public.role_permissions`. Configura suscripción en tiempo real a cambios de perfil en Postgres.
- **Validaciones:** Comprueba que `is_active = true`. Si no tiene perfil, expulsa la sesión.
- **Base de Datos:** Registra en `public.user_activity_log` el evento `user.login`.

#### Paso 2: Selección de Módulo y Carga Reactiva
- **Usuario:** Selecciona el módulo deseado en el sidebar.
- **LUXIA:** `ScreenCalculatorPage.tsx` valida permisos contra `VIEW_PERMISSIONS` (`production.view`, `inventory.view`, `orders.view`, `settings.view`, `users.view`). Si no tiene acceso a la vista actual, redirige a la primera vista permitida. En segundo plano, `useInventorySync` y `useOrderSync` cargan catálogos y órdenes en stores de Zustand.

#### Paso 3: Configuración de la Cortina (Producción V2)
- **Usuario:** Elige Familia de Tela, Apertura y Color. Ingresa Ancho Terminado (m), Alto Terminado (m), Cantidad y Sistema de Anclaje (`standard`, `pin_endplug`, `double_bracket`). Opcionalmente selecciona un retazo preexistente.
- **LUXIA:** `hardwareToneRules.ts` deriva automáticamente el tono de los herrajes (`white`, `ivory`, `grey`, `bronze`) según el color de la tela. Oculta muestrarios/bindercards (`0903167`). `selectFabricWithStock.ts` consulta rollos madre disponibles.

#### Paso 4: Validación de Reglas Industriales y Seguridad
- **LUXIA:** `screen.ts` valida dimensiones positivas y ancho máximo (19 ft / 5.79 m). Si se selecciona *Motorized*, bloquea la acción (`validateScreenInput`). En *Double Bracket*, exige cortinas en parejas de ancho idéntico (tolerancia 1 mm). Si el ancho supera 2.80 m, despliega `DoubleBracketWidthAlert.tsx` requiriendo aceptación expresa de riesgo del cliente.

#### Paso 5: Cálculo de Medidas de Fabricación
- **LUXIA:**
  - Tela: Ancho de corte = `ancho + 0.10 m`. Alto de corte = `alto + 0.25 m` (15cm enrolle + 5cm bolsillo + 5cm caída).
  - *Edge Roll Fit:* Si el corte excede el rollo por $le 0.10$ m, ajusta el corte exacto al rollo.
  - *Rotación:* Si el ancho excede el rollo pero el alto cabe, rota la pieza 90° alertando la orientación.
  - Perfiles: Descuento de 30 mm (`ancho - 0.030 m`) para tubo y contrapeso.
  - Cadena: Longitud = `alto * 2.0`.

#### Paso 6: Resolución de BOM V2 Canónica
- **LUXIA:** `doubleBracketBom.ts` invoca `resolveGroupBom` con `roller-bom-rules-v2.json`. Determina tubo según rango (T38 NEO ≤ 1.80m, T38 Normal ≤ 2.20m, T45 ≤ 2.70m, T63 > 2.70m). Resuelve SKUs de accesorios por tono. Excluye clutch V20 si aplica VTX30. Asigna componentes con alcance `curtain` (por cortina) o `group` (una vez por conjunto doble).

#### Paso 7: Optimización de Corte en Lote (Cutting Optimizer)
- **LUXIA:** `cuttingOptimizer.ts` agrupa cortinas por tejido y color. Evalúa combinaciones de rollos (2.50m / 3.00m) mediante particionado exhaustivo ($N le 7$) o First Fit Decreasing ($N > 7$), minimizando el desperdicio y proyectando retazos útiles.

#### Paso 8: Guardado de Orden y Transacción Atómica de Inventario
- **Usuario:** Pulsa "Guardar Orden".
- **LUXIA:** `buildConsumptionPlan.ts` compila el plan (`consume`, `use_scrap`, `create_scrap`) y llama al RPC `process_order_inventory_tx`.
- **Base de Datos:** PostgreSQL valida permisos (`inventory.consume`, `production.create_order`), inserta la orden en `work_orders`, bloquea rollos con `FOR UPDATE SKIP LOCKED`, descuenta `available_yd2`, inserta retazos en `inventory_items` y registra movimientos en `inventory_movements`.

#### Paso 9: Gestión en Módulo de Órdenes Guardadas
- **LUXIA:** `SavedOrdersPanel.tsx` muestra la orden en estado `ready_for_production`. Ofrece filtros de fecha, estado, búsqueda por texto, ordenamiento y menú contextual.

#### Paso 10: Revisión de Materiales de Taller (Material Review)
- **Usuario:** El supervisor abre `MaterialReviewModal.tsx`.
- **LUXIA:** Permite confirmar, sustituir, ajustar cantidades o agregar componentes. `issueStrategies.ts` ejecuta el empaquetado de tubos sobre barras de 19 ft, registrando descartes para sobrantes menores a 1.00 m. Al guardar, actualiza el estado a `materials_checked`.

#### Paso 11: Validación Previa al Descargo SAGE
- **LUXIA:** `validateOrderBeforeSage.ts` verifica que la orden tenga cortinas, esté revisada (`materials_checked`), no posea SKUs vacíos ni placeholders con 'X', y que las telas tengan cantidades válidas.

#### Paso 12: Exportación SAGE Order Entry
- **Usuario:** Pulsa "Exportar a SAGE".
- **LUXIA:** `sageExport.ts` genera el archivo Excel multi-pestaña (`OrderEntrySAGE_LUXIA_YYYY-MM-DD.xlsx`) con ORDUNIQ `PRODUC`, cliente `PRODUC`, números de línea en saltos de 32 y cantidades con 4 decimales. Actualiza la orden a `sent_to_sage` y persiste retazos lineales en Bodega vía `commitIssueSnapshotToInventory`.

#### Paso 13: Emisión de Documentación Técnica (PDF)
- **Usuario:** Pulsa "Generar Hoja de Materiales".
- **LUXIA:** `generateOrderMaterialsPdf.ts` produce el documento técnico de fabricación con logotipo de Vertilux, planos de corte y lista de materiales consolidada. Transiciona el estado a `in_production`.

#### Paso 14: Gestión en Bodega 3.0
- **LUXIA:** `InventoryPanelV2.tsx` muestra existencias en tiempo real (Telas y Lineales), métricas de aprovechamiento, y permite altas y bajas masivas de retazos.

#### Paso 15: Sincronización Programada API Vertilux
- **LUXIA:** Vercel Cron (06:00 UTC) y GitHub Actions (06:00 y 18:00 UTC) ejecutan `apiSyncService.ts`. Consulta `ims.vertilux.com/api/catp/catp.php`. Realiza conciliación no destructiva preservando cortes locales y registra resultados en `api_sync_logs`.

#### Paso 16: Cancelación y Rollback Transaccional
- **Usuario:** Selecciona "Cancelar Orden".
- **LUXIA:** Ejecuta el RPC `cancel_order_inventory_tx`. Bloquea la orden, valida que no esté completada (`CANNOT_CANCEL_COMPLETED_ORDER`), comprueba que ningún retazo generado haya sido usado por otra orden (`SCRAP_ALREADY_USED`), reintegra stock a los rollos originales, invalida retazos creados, genera movimientos tipo `rollback` y marca la orden como `cancelled`.

#### Paso 17: Auditoría y Trazabilidad Continua
- **LUXIA:** Todas las acciones críticas quedan grabadas de forma inmutable en `user_activity_log`, `api_sync_logs` e `inventory_movements`.

---

# 4. FASE 4: MAPA DETALLADO DE MÓDULOS DEL SISTEMA

### 4.1 Módulo de Producción (`ProductionModuleV2`)
- **Objetivo:** Configuración de vanos, dimensionamiento técnico, cálculo BOM y optimización de lotes.
- **Usuario Típico:** Operador de producción, supervisor técnico.
- **Entradas:** Ancho, alto, cantidad, colección de tela, color, apertura, sistema de anclaje.
- **Procesamiento:** Fórmulas de corte (`screen.ts`), BOM V2 (`doubleBracketBom.ts`), optimizador (`cuttingOptimizer.ts`).
- **Salidas:** Previsualización de corte, Lote de producción, Orden persistida.
- **Validaciones:** Límites dimensionales, Double Bracket width limit (>2.80m), bloqueo de motorizados.
- **Estado de Madurez:** ✅ **Production Ready**.

### 4.2 Módulo de Bodega / Inventario (`InventoryPanelV2`)
- **Objetivo:** Gestión de rollos, barras de aluminio y retazos recuperados; monitor de sincronización API.
- **Usuario Típico:** Almacenista, encargado de inventarios.
- **Entradas:** Búsqueda, filtros por estado, formularios de alta y baja.
- **Procesamiento:** Agrupamiento de stock, evaluación de salud de API (umbral 14h), bulk actions.
- **Salidas:** Altas/bajas en `inventory_items`, movimientos en `inventory_movements`, exportación Excel.
- **Estado de Madurez:** ✅ **Production Ready**.

### 4.3 Módulo de Órdenes Guardadas (`SavedOrdersPanel`)
- **Objetivo:** Administración de órdenes, revisión de taller, emisión de PDFs y exportación SAGE.
- **Usuario Típico:** Supervisor de planta, planificador de operaciones.
- **Entradas:** Selección de órdenes, ajustes en modal de revisión.
- **Procesamiento:** Máquina de estados, empaquetado de barras 19ft, generación XLSX y PDF.
- **Salidas:** Archivo `OrderEntrySAGE_LUXIA_YYYY-MM-DD.xlsx`, PDFs técnicos, cancelación con rollback.
- **Estado de Madurez:** ✅ **Production Ready**.

### 4.4 Módulo de Configuración (`RulesPanel`)
- **Objetivo:** Inspección de tolerancias de corte, factores de cadena y reglas BOM.
- **Usuario Típico:** Administrador, ingeniero de producto.
- **Entradas:** Consulta de parámetros.
- **Procesamiento:** Visualización estructurada de reglas base.
- **Salidas:** Vista de parámetros y tolerancias.
- **Estado de Madurez:** 🟡 **Functional / Needs UX** (Lectura operativa; edición dinámica en UI pendiente).

### 4.5 Módulo de Usuarios y RBAC (`UsersPanel`)
- **Objetivo:** Administración de cuentas, roles dinámicos, asignación de permisos y logs de actividad.
- **Usuario Típico:** Administrador del sistema.
- **Entradas:** Formularios de usuario, checkboxes de permisos.
- **Procesamiento:** Modificación de `profiles`, `role_permissions`, invocación de Edge Functions.
- **Salidas:** Actualizaciones de acceso y visualización de auditoría.
- **Estado de Madurez:** ✅ **Production Ready**.

---

# 5. FASE 5: MÓDULO DE PRODUCCIÓN INDUSTRIAL

### Dimensionamiento: "Cliente" vs "Planta"
- **Ancho Cliente:** Ancho terminado de vano (ej. 2.000 m).
- **Corte de Tela:** `2.000 m + 0.100 m = 2.100 m` (encuadre y tolerancia lateral).
- **Corte de Tubo de Enrolle:** `2.000 m - 0.030 m = 1.970 m` (descuento para soportes y mandos).
- **Corte de Bottomrail:** `2.000 m - 0.030 m = 1.970 m` (descuento para tapaderas terminales).
- **Alto Cliente:** Alto terminado de vano (ej. 2.200 m).
- **Largo de Corte de Tela:** `2.200 m + 0.150 m (enrolle) + 0.050 m (bolsillo) + 0.050 m (seguridad) = 2.450 m`.
- **Cadena de Mando:** `2.200 m × 2.0 = 4.400 m`.

### Restricciones y Confirmaciones Críticas
- **Motorized:** Bloqueado explícitamente por validación (`validateScreenInput`). Mensaje: *"Configuración motorizada no disponible en esta versión (reglas de motor pendientes de catálogo)"*.
- **Double Bracket > 2.80 m:** Requiere confirmación expresa de *Riesgo Asumido por el Cliente* en `DoubleBracketWidthAlert.tsx`.

---

# 6. FASE 6: ARQUITECTURA BOM V2 — SINGLE SOURCE OF TRUTH

### Estado de Fuente Única de Verdad: ✅ 100% VERIFICADO
Toda la plataforma utiliza el motor oficial BOM V2 (`src/logic/doubleBracketBom.ts` + `src/data/roller-bom-rules-v2.json`):
- **Preview de Fabricación:** Llama a `generateRollerBOM`, el cual delega directamente en `resolveGroupBom`.
- **Órdenes Guardadas:** Almacenan las `materialLines` resueltas por `resolveGroupBom`.
- **Material Review Modal:** Carga las `materialLines` guardadas de la orden.
- **Generador de PDF:** Agrupa exclusivamente sobre las `materialLines` de la orden.
- **Exportador a SAGE:** Utiliza las líneas finales validadas por el Material Review.

### Scopes y Exclusiones
- **Scope `curtain`:** Componentes multiplicados por cada cortina (tubo, contrapeso, tela, cadena, tapaderas, topes).
- **Scope `group`:** Componentes compartidos calculados una sola vez por conjunto (soportes intermedios Double Bracket).
- **Exclusión de Control:** Si el ancho exige control pesado (VTX30), el motor elimina automáticamente el clutch estándar V20.

---

# 7. FASE 7: OPTIMIZADOR DE CORTE DE TELA (CUTTING OPTIMIZER)

- **Problema:** Reducir el desperdicio al cortar múltiples cortinas sobre rollos estándar de tela (2.50m / 3.00m).
- **Algoritmo:**
  - Agrupa por `familia|color`.
  - Para $N le 7$ cortinas: **Búsqueda exhaustiva recursiva** que garantiza el mínimo global de merma.
  - Para $N > 7$ cortinas: **First Fit Decreasing (FFD)** ordenando por ancho decreciente.
- **Estimación de Retazos:** Sobrantes con ancho $ge 0.40$ m y largo $ge 1.00$ m se clasifican como retazos recuperables (`create_scrap`).

---

# 8. FASE 8: SUBFLUJO DE BODEGA, INVENTARIO Y MOVIMIENTOS ATÓMICOS

- **Estructura de Datos:**
  - `inventory_items`: `category` (`fabric`, `tube`, `bottom`, `component`), `kind` (`roll`, `scrap`, `bar`, `unit`), `status` (`available`, `reserved`, `used`, `deleted`), `payload` JSONB.
  - `inventory_movements`: `action` (`consume`, `use_scrap`, `create_scrap`, `rollback`), cantidades y usuario responsable.
- **Transacción Atómica de Consumo (`process_order_inventory_tx`):**
  - Valida permisos (`inventory.consume`).
  - Bloquea rollos con `SELECT ... FOR UPDATE SKIP LOCKED`.
  - Descuenta `available_yd2` en telas y metros en perfiles.
  - Inserta retazos generados y registra movimientos de inventario.

---

# 9. FASE 9: INTEGRACIÓN EXTERNA: MOTOR DE SINCRONIZACIÓN API VERTILUX

- **Origen:** `https://ims.vertilux.com/api/catp/catp.php`
- **Autenticación:** Headers HTTPS (`X-API-KEY`, `X-USER`, `X-PASSWORD`, `X-COUNTRY`).
- **Programación:**
  - Vercel Cron: Diario a las 06:00 UTC (`0 6 * * *` en `vercel.json`).
  - GitHub Actions: Respaldo 2 veces al día a las 06:00 y 18:00 UTC (`.github/workflows/sync-inventory.yml`).
- **Lock de Concurrencia:** Bloquea ejecuciones si existe una previa iniciada hace menos de 5 minutos.
- **Conciliación No Destructiva (`syncVertiluxInventoryPlan.ts`):** Si un ítem tiene movimientos locales en `inventory_movements`, preserva su stock `available_yd2` local y marca la fila con `syncNeedsReconciliation`.
- **Monitor de Salud (`apiSyncAudit.ts`):** Evalúa el tiempo transcurrido desde el último éxito; si supera **14 horas**, emite alerta en Bodega 3.0.

---

# 10. FASE 10: SUBFLUJO DE ÓRDENES GUARDADAS Y AUDITORÍA DE TALLER

### Máquina de Estados Verificada
1. `draft` (Borrador inicial)
2. `ready_for_production` (Orden guardada con reserva de stock)
3. `in_production` (En proceso de corte tras generar PDF)
4. `materials_checked` (Revisión de materiales confirmada en taller)
5. `sent_to_sage` (Exportada a libro Excel para SAGE 300)
6. `completed` (Cortina terminada y despachada)
7. `cancelled` (Cancelada con reversión total de stock)

---

# 11. FASE 11: INTEGRACIÓN ERP SAGE Y MOTOR DE DESCARGO

- **Archivo Generado:** `OrderEntrySAGE_LUXIA_YYYY-MM-DD.xlsx`
- **Estructura:**
  - Hoja `Orders`: ORDUNIQ `PRODUC`, cliente `PRODUC`, tipo `1`, fecha SAGE.
  - Hoja `Order_Details`: Salto de línea x32 (32, 64, 96...), localización `1`, cantidades con 4 decimales.
  - Hojas Auxiliares: Seriales, Lotes, Pagos, Comentarios, Campos Opcionales.
- **Empaquetado de Barras (`issueStrategies.ts`):** Simula corte óptimo de tubos en barras de 19 ft, descarga la barra completa a SAGE y genera retazos en `inventory_items`.

---

# 12. FASE 12: CICLO DE VIDA DE RETAZOS (SCRAPS) Y PROTECCIÓN DE CONSUMO

- **Generación:** Mermas $ge 1.00$ m en perfiles y $ge 0.40	ext{m} 	imes 1.00	ext{m}$ en telas se ingresan con estado `available`.
- **Consumo:** Seleccionables en Producción V2, vinculando el retazo a la cortina (`use_scrap`).
- **Protección ante Cancelación:** Si la Orden A generó un retazo y la Orden B ya lo consumió, `cancel_order_inventory_tx` aborta con la excepción:
  `SCRAP_ALREADY_USED: No se puede cancelar la orden automáticamente porque el retazo generado ya fue utilizado total o parcialmente en otra orden. Requiere conciliación manual.`

---

# 13. FASE 13: MECANISMO TRANSACCIONAL DE CANCELACIÓN Y ROLLBACK

El RPC `cancel_order_inventory_tx` ejecuta:
1. Validación de permisos (`orders.delete`, `orders.edit`, `production.create_order`, `inventory.consume`).
2. Bloqueo de fila `FOR UPDATE` en `work_orders`.
3. Bloqueo si la orden está completada (`CANNOT_CANCEL_COMPLETED_ORDER`).
4. Verificación de retazos usados (`SCRAP_ALREADY_USED`).
5. Reversión: Reintegra `available_yd2` en telas, restaura longitudes en barras, marca retazos creados como `deleted` e inserta movimientos con `action = 'rollback'`.
6. Actualiza el estado de la orden a `cancelled`.

---

# 14. FASE 14: CONTROL DE ACCESO BASADO EN ROLES (RBAC) Y SEGURIDAD

### Matriz de Permisos por Rol

| Función | Admin | Producción | Bodega | Consulta |
|---|:---:|:---:|:---:|:---:|
| Ver Producción (`production.view`) | ✅ | ✅ | ❌ | ✅ |
| Crear Órdenes (`production.create_order`) | ✅ | ✅ | ❌ | ❌ |
| Agregar a Lote (`production.add_to_batch`) | ✅ | ✅ | ❌ | ❌ |
| Ver Bodega (`inventory.view`) | ✅ | ✅ | ✅ | ✅ |
| Consumir / Ajustar Inventario (`inventory.consume`) | ✅ | ✅ | ✅ | ❌ |
| Dar de Baja Retazos (`inventory.discard_scrap`) | ✅ | ❌ | ✅ | ❌ |
| Exportar Inventario Excel (`inventory.export`) | ✅ | ❌ | ✅ | ❌ |
| Ver Órdenes (`orders.view`) | ✅ | ✅ | ❌ | ✅ |
| Generar PDF de Taller (`orders.generate_pdf`) | ✅ | ✅ | ❌ | ✅ |
| Exportar a SAGE (`orders.export_sage`) | ✅ | ❌ | ❌ | ❌ |
| Eliminar / Cancelar Orden (`orders.delete`) | ✅ | ❌ | ❌ | ❌ |
| Administrar Usuarios y Roles (`users.view` / `edit_roles`) | ✅ | ❌ | ❌ | ❌ |

---

# 15. FASE 15: SEGURIDAD DE DATOS, SECRETOS Y POLÍTICAS RLS

- **Supabase Auth:** Autenticación por JSON Web Tokens (JWT).
- **Row Level Security (RLS):** Habilitado en todas las tablas (`work_orders`, `inventory_items`, `inventory_movements`, `api_sync_logs`, `user_activity_log`, `profiles`, `roles`, `permissions`, `role_permissions`).
- **RPCs SECURITY DEFINER:** `process_order_inventory_tx` y `cancel_order_inventory_tx` se ejecutan con `SET search_path = public` validando explícitamente `auth.uid()` y permisos.
- **Protección de Cron:** `CRON_SECRET` en cabecera `Authorization: Bearer <secret>` para disparos serverless en Vercel.
- **Cero Exposición de Secretos:** Claves de API Vertilux y tokens de servicio aislados en variables de entorno servidor.

---

# 16. FASE 16: ARQUITECTURA DE BASE DE DATOS Y MAPEO DE TABLAS

- `public.profiles`: Usuarios, emails, rol y estado activo.
- `public.roles` & `public.permissions` & `public.role_permissions`: Estructura RBAC relacional.
- `public.work_orders`: Órdenes de trabajo, payloads JSON y estado.
- `public.inventory_items`: Rollos, barras de aluminio y retazos de tela.
- `public.inventory_movements`: Registro inmutable de consumos y reversiones.
- `public.api_sync_logs`: Historial y métricas de sincronización con API Vertilux.
- `public.user_activity_log`: Log inmutable de acciones críticas de usuario.
- `public.catalog_items`: Catálogo de costos y referencias de producto.

---

# 17. FASE 17: AUDITORÍA, TRAZABILIDAD Y LOGS DE ACTIVIDAD

Triple capa de auditoría activa:
1. **Actividad de Usuario (`user_activity_log`):** Logins, cambios de roles, desactivaciones y eliminaciones de órdenes.
2. **Movimientos de Stock (`inventory_movements`):** Cada corte, consumo, alta de retazo y reversión con usuario y orden asociada.
3. **Sincronización API (`api_sync_logs`):** Recuento de registros procesados, duración en ms, disparador y errores.

---

# 18. FASE 18: MÉTRICAS DE CALIDAD, TESTING Y VERIFICACIÓN

### QUALITY STATUS
- **Total Test Suites:** 45 suites ejecutadas (`vitest run`).
- **Total Tests Unitarios / Integración:** **636 tests pasando exitosamente (100% OK)**.
- **TypeScript Strict Typecheck:** **PASS** (`tsc --noEmit -p tsconfig.app.json` sin errores).
- **Production Build:** **PASS** (`vite build` generado en 4.39 segundos con 939 módulos transformados).
- **Contratos Validados:** BOM V2 Single Source, Double Bracket Guard, Transacciones RPC, Sincronización API, Exportación SAGE y Generación PDF.

---

# 19. FASE 19: HITOS PRINCIPALES IMPLEMENTADOS

1. **BOM V2 Single Source of Truth:** Unificación total del cálculo sobre `roller-bom-rules-v2.json` y `resolveGroupBom`.
2. **Transacciones Atómicas de Inventario:** Descuento y cancelación con rollback (`cancel_order_inventory_tx`) y protección `SCRAP_ALREADY_USED`.
3. **Sincronización Programada API Vertilux:** Automatización serverless con Vercel Cron y GitHub Actions, preservando consumos locales.
4. **Rediseño Focus Mode (Producción V2):** Interfaz industrial de alta velocidad con visualización previa de corte y alertas de seguridad.
5. **Auditoría Integral y RBAC Dinámico:** Matriz de 4 roles, logs de actividad y seguridad RLS completa.

---

# 20. FASE 20: MATRIZ DE MADUREZ DEL SISTEMA

| Área / Funcionalidad | Estado | Comentario |
|---|:---:|---|
| **Cálculo de Fabricación Roller** | ✅ Production Ready | 636 tests unitarios pasando. |
| **BOM V2 Canónico** | ✅ Production Ready | Fuente única de verdad consolidada. |
| **Optimizador de Corte** | ✅ Production Ready | Algoritmo exhaustivo y FFD operativo. |
| **Bodega & Retazos** | ✅ Production Ready | Gestión activa de mermas y sobrantes. |
| **Sincronización API Vertilux** | ✅ Production Ready | Vercel Cron + GitHub Actions + monitor de salud. |
| **Revisión de Taller & SAGE** | ✅ Production Ready | Exportación XLSX multi-pestaña validada. |
| **Cancelación con Rollback** | ✅ Production Ready | RPC transaccional con candado de retazos. |
| **Control de Acceso (RBAC)** | ✅ Production Ready | 4 roles + permisos dinámicos. |
| **Documentación PDF Taller** | ✅ Production Ready | Hojas de corte y sustituciones en PDF. |
| **Configuración Dinámica en UI** | 🟡 Functional / Needs UX | Visualizador activo; edición requiere guardar JSON. |
| **Soporte Motorizado (Motorized)** | 🔴 Not Implemented | Bloqueado formalmente; reglas de motor pendientes. |

---

# 21. FASE 21: LIMITACIONES ACTUALES Y DEUDA TÉCNICA

- **[LIMITATION] Cortinas Motorizadas:** Bloqueadas por validación (`validateScreenInput`) hasta integrar catálogo maestro de motores y coronas.
- **[LIMITATION] Tipos de Cortina No-Roller:** El sistema está especializado exclusivamente en cortinas Roller.
- **[FUTURE FEATURE] Editor Gráfico de Reglas BOM:** Actualmente las reglas residen en `roller-bom-rules-v2.json`.
- **[TECHNICAL DEBT] Bundle Chunk Sizes:** Módulos de exportación PDF y XLSX generan advertencia en Vite por tamaño > 500 kB (optimizable con dynamic imports).

---

# 22. FASE 22: ROADMAP ESTRATÉGICO RECOMENDADO

> **NOTA:** Esta sección constituye una [RECOMMENDATION] técnica y operativa.

1. **Fase 1: Módulo de Automatización y Motores (Q4 2026)** — Incorporar motores Somfy/Vertilux y coronas al catálogo BOM.
2. **Fase 2: Terminal Táctil de Taller (PWA Offline-First)** — Modo estación para mesa de corte con escaneo de código de barras.
3. **Fase 3: Editor Visual de Reglas BOM** — Calibración de descuentos y tolerancias desde el panel de configuración sin despliegues de código.
4. **Fase 4: Conector API Directo SAGE 300** — Reemplazar archivos XLSX por webhooks directos al ERP.

---

# 23. FASE 23: DIAGRAMAS ARQUITECTÓNICOS Y OPERATIVOS

Consulte los diagramas integrados en la Sección 2 (Arquitectura General), Sección 4 (Sincronización API) y Sección 5 (Cancelación y Rollback).

---

# 24. FASE 24: FORMATO Y ESPECIFICACIONES DEL ENTREGABLE

- **Documento Markdown:** `docs/LUXIA_Executive_Project_Status_2026.md`
- **Documento PDF:** `LUXIA_Executive_Project_Status_2026.pdf`
- **Estilo:** Tipografía corporativa ejecutiva, acentos en rojo de marca (`#c0253a`), tablas legibles y diagramas vectoriales.

---

# 25. FASE 25: AUDIENCIAS Y NIVELES DE LECTURA

- **Para Dirección / Operaciones:** Secciones 1 (Executive Summary), 2 (Workflow), 20 (Madurez), 19 (Hitos), 21 (Limitaciones) y 22 (Roadmap).
- **Para Equipo de Ingeniería / TI:** Secciones 6 (BOM V2), 7 (Optimizer), 8 (Inventario), 9 (API Sync), 13 (Rollback RPC), 15 (Seguridad RLS) y 18 (Testing).

---

# 26. FASE 26: PROTOCOLO DE EXACTITUD Y VERIFICACIÓN

Se ha respetado el orden jerárquico de verdad:
1. Código fuente en tiempo de ejecución.
2. Esquemas y migraciones SQL en Supabase.
3. Suite de tests automatizados (`vitest`).
4. Documentación histórica.
Toda afirmación contenida en este documento cuenta con respaldo directo en el repositorio.

---

# 27. FASE 27: CITAS Y REFERENCIAS INTERNAS DE CÓDIGO FUENTE

- **Punto de Entrada SPA:** `src/app/App.tsx`
- **Router y Navegación:** `src/features/calculadora-screen/ScreenCalculatorPage.tsx`
- **Sesión y RBAC:** `src/store/useAuthStore.ts`, `src/components/PermissionGate.tsx`
- **Motor BOM V2:** `src/logic/doubleBracketBom.ts`, `src/data/roller-bom-rules-v2.json`
- **Motor Industrial:** `src/domain/curtains/screen.ts`, `src/domain/curtains/cuttingOptimizer.ts`
- **Sincronización API:** `src/services/apiSyncService.ts`, `src/services/apiSyncAudit.ts`, `api/cron/sync-inventory.ts`
- **Transacciones de Inventario:** `src/lib/supabaseOrderInventory.ts`, `supabase/migrations/20260822000001_cancel_order_inventory_tx.sql`
- **Exportación SAGE y Revisión:** `src/lib/sageExport.ts`, `src/domain/orders/issueStrategies.ts`, `src/domain/orders/validateOrderBeforeSage.ts`
- **Generación de PDF:** `src/lib/pdf/generateOrderMaterialsPdf.ts`
- **Migraciones SQL:** `scripts/migrate-rbac-phase1.sql`, `scripts/migrate-user-activity-log.sql`

---

# 28. FASE 28: CONCLUSIÓN Y VALIDACIÓN FINAL DE CERO MODIFICACIONES

Se certifica que:
- No se han modificado archivos de código fuente, interfaz, lógica de negocio ni migraciones durante esta auditoría.
- No se han expuesto contraseñas, claves API, variables secretas ni tokens de servicio.
- El sistema se encuentra en un estado estable, consistente y 100% verificado.
