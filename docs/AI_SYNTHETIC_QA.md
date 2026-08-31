# LUXIA — AI Synthetic QA Agent / Sistema Autónomo de Pruebas de Usuario Sintético

El **AI Synthetic QA Agent** es una suite autónoma de pruebas End-to-End (E2E) basada en **Playwright + Chromium** diseñada para simular usuarios humanos reales navegando por la interfaz de LUXIA en tiempo real. 

A diferencia de los tests unitarios tradicionales, estos agentes autónomos operan directamente sobre el DOM renderizado (haciendo clics, llenando formularios, esperando transiciones de React y abriendo modales) para auditar la integridad operativa del sistema antes de que cualquier cambio llegue a producción.

---

## 1. ¿Qué es el AI Synthetic QA Agent?

El agente sintético emula 4 arquetipos de usuario (Personas) clave en la fábrica de LUXIA / Vertilux:

1. **Operador de Planta / Mesa de Corte (`OperatorBot`)**:
   - Configura telas, sistemas de montaje, dimensiones y factores de apertura.
   - Audita el motor de optimización de corte en mesa (1 persiana, lotes de 5 persianas y lotes masivos de 10 persianas).
   - Valida la visualización del diagrama de corte, las piezas cortadas y el desperdicio.
   - Guarda órdenes de producción en la base de datos sandbox.

2. **Supervisor de Taller / Planificador (`SupervisorBot`)**:
   - Inspecciona las órdenes guardadas en la bandeja operativa (`Todas`, `En Taller`, `Por Revisar`, `Listas SAGE`).
   - Audita el modal de detalle y la descomposición de materiales BOM V2.
   - Ejecuta cancelaciones de órdenes con rollback transaccional automático de telas y tubos hacia bodega.
   - Verifica el bloqueo de seguridad `SCRAP_ALREADY_USED` cuando un retazo generado ya fue consumido por otra orden posterior.

3. **Encargado de Bodega (`WarehouseBot`)**:
   - Audita la visualización de rollos madre, retazos de tela y sobrantes lineales.
   - Realiza búsquedas y filtrados reactivos de inventario.
   - Dispara sincronizaciones manuales auditadas con verificación del indicador de salud (*Sync Health Pill*).

4. **Chaos Monkey (`ChaosMonkeyBot`)**:
   - Ejecuta *fuzzing* determinista con generador pseudo-aleatorio con semilla fija (`QA_SEED`).
   - Inyecta entradas deformadas, valores negativos, cero, caracteres especiales y strings Unicode en los campos de dimensiones.
   - Dispara ráfagas de doble clic rápido para verificar la idempotencia de los botones de guardado.
   - Conmuta rápidamente entre pestañas para verificar la resistencia del event loop y detectar congelamientos (`UI_FREEZE`).

---

## 2. Cuándo se Ejecuta (Estrategia de CI/CD)

El sistema está configurado en GitHub Actions para ejecutarse automáticamente bajo tres modalidades:

```text
                           ┌────────────────────────┐
                           │   EVENTO DE DESARROLLO │
                           └───────────┬────────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            │                          │                          │
            ▼                          ▼                          ▼
   [ Pull Request ]             [ Push a main ]             [ Nightly (04:00 UTC) ]
            │                          │                          │
            ▼                          ▼                          ▼
   ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
   │ 1. Build LUXIA  │        │ 1. Build LUXIA  │        │ 1. Build LUXIA  │
   │ 2. Vitest Unit  │        │ 2. Vitest Unit  │        │ 2. Vitest Unit  │
   │ 3. Standard QA  │        │ 3. Standard QA  │        │ 3. Standard QA  │
   └────────┬────────┘        └────────┬────────┘        │ 4. Edge QA      │
            │                          │                 │ 5. Chaos Monkey │
            │                          │                 └────────┬────────┘
            ▼                          ▼                          ▼
   [ PASS: Merge OK ]         [ PASS: Deploy OK ]        [ PASS: Report OK ]
   [ FAIL: Block PR ]         [ FAIL: Alert ]            [ FAIL: Alert + Logs ]
```

### A. Pull Request Quality Gate (`.github/workflows/qa-agent.yml`)
* **Trigger**: Al abrir o actualizar cualquier Pull Request hacia la rama `main`.
* **Suites**: `npm run build` + `npx vitest run` + `npm run test:agent` (Standard).
* **Política**: **Bloqueo estricto**. Si algún test falla, el PR se marca en rojo y no se permite el merge.
* **Concurrencia**: `cancel-in-progress: true` (si el desarrollador envía nuevos commits al PR, la ejecución previa se cancela para ahorrar minutos de CI).

### B. Push a Rama Principal (`.github/workflows/qa-agent.yml`)
* **Trigger**: Al fusionar o hacer push directo en `main`.
* **Suites**: `npm run build` + `npx vitest run` + `npm run test:agent` (Standard).
* **Política**: Verificación de integridad post-merge.

### C. Ejecución Nocturna Programada (`.github/workflows/nightly-qa.yml`)
* **Trigger**: Cron diario a las `04:00 UTC` (22:00 CST) o manual vía `workflow_dispatch`.
* **Suites**: `npm run test:agent` (Standard) + `npm run test:agent:edge` (Casos Límite) + `npm run test:agent:chaos` (Chaos Monkey con semilla PRNG).
* **Retención de Artefactos**: 30 días para auditoría histórica de estabilidad.

---

## 3. Comandos de Ejecución Local

Para correr las pruebas sintéticas en tu máquina de desarrollo:

```bash
# 1. Ejecutar la suite estándar de regresión (Headless)
npm run test:agent

# 2. Ejecutar viendo el navegador Chromium en tiempo real (Headed GUI)
npm run test:agent:headed

# 3. Ejecutar la suite de casos límite e idempotencia
npm run test:agent:edge

# 4. Ejecutar el Chaos Monkey con fuzzing determinista
npm run test:agent:chaos

# 5. Abrir el reporte interactivo HTML de Playwright
npm run test:agent:report
```

---

## 4. Cómo Reproducir Fallos de Chaos Monkey

El Chaos Monkey genera una semilla numérica aleatoria para que cada ejecución sea diferente, pero si detecta un error, la semilla queda registrada en los logs de consola:

```text
====================================================
  LUXIA — AI Synthetic QA Agent / Test Runner
====================================================
 Mode:        CHAOS MONKEY
 Seed:        843877
 Reproduce:   QA_SEED=843877 npm run test:agent:chaos
----------------------------------------------------
```

Para reproducir exactamente la misma secuencia fuzzed que causó el error:

```bash
# En Windows PowerShell
$env:QA_SEED="843877"; npm run test:agent:chaos

# En Bash / Linux / macOS
QA_SEED=843877 npm run test:agent:chaos
```

---

## 5. Inspección de Artefactos de Diagnóstico

Cuando un escenario falla, el sistema genera automáticamente:

1. **HTML Report (`playwright-report/index.html`)**:
   - Árbol jerárquico de pasos, capturas de pantalla integradas, videos embebidos y tiempos de respuesta por selector.
   - Ejecuta `npm run test:agent:report` para visualizarlo localmente.
2. **Screenshots (`test-results/**/*.png`)**:
   - Captura exacta del estado visual de LUXIA en el milisegundo en que ocurrió la excepción.
3. **Videos (`test-results/**/*.webm`)**:
   - Grabación de video de toda la sesión del bot desde el login hasta el fallo.
4. **Traces de Playwright (`test-results/**/*.zip`)**:
   - Permite depurar paso a paso con el Playwright Trace Viewer:
     ```bash
     npx playwright show-trace test-results/<nombre-del-test>/trace.zip
     ```
5. **Contexto de Error (`test-results/**/error-context.md`)**:
   - Instantánea textual de la accesibilidad del DOM, elementos visibles, alertas y jerarquía de componentes en el momento del fallo.

---

## 6. Garantías de Aislamiento de Red (Zero Production Network)

El sistema cuenta con un **Network Guard** activo en [`e2e/helpers/networkGuard.ts`](file:///c:/Users/LAPTOP/OneDrive/Documentos/LUXIA/e2e/helpers/networkGuard.ts):

* **Allowlist Estricta**: Solo se permiten peticiones a `http://localhost:*`, `http://127.0.0.1:*`, `data:`, `blob:`, y fuentes tipográficas de Google Fonts.
* **Mockeo Integral**: Todas las llamadas a Supabase Auth (`/auth/v1/*`), PostgREST (`/rest/v1/*`), funciones RPC (`process_order_inventory_tx`, `cancel_order_inventory_tx`), sincronización local (`/api/sync-inventory`) e imágenes de CDN se resuelven contra el Sandbox en memoria.
* **Trampa de Bloqueo**: Si algún código intenta conectarse a un endpoint externo de producción o SAGE real:
  1. La conexión es abortada inmediatamente en el cliente (`route.abort('blockedbyclient')`).
  2. Se registra en el contador `productionRequestsAttempted`.
  3. La prueba falla y se genera un error clasificado como `SANDBOX_SECURITY`.

Al finalizar cada ejecución, se audita en consola:
```text
Production requests attempted: 0
Production requests allowed:   0
```

---

## 7. Cómo Agregar un Nuevo Escenario

Para incorporar un nuevo flujo de prueba:

1. **Si requiere nuevas interacciones de usuario**: Extiende la clase correspondiente en `e2e/personas/` (ej. `operatorBot.ts`, `supervisorBot.ts`, `warehouseBot.ts`).
2. **Crea el caso de prueba** en el archivo correspondiente de `e2e/scenarios/`:
   ```typescript
   import { test, expect } from '../fixtures/luxia.fixture';
   import { OperatorBot } from '../personas/operatorBot';

   test.describe('Nueva Característica', () => {
     test('OPERATOR-004: Configurar y validar nuevo accesorio', async ({ page, sandbox }) => {
       const bot = new OperatorBot(page);
       await bot.login();
       await bot.navigateToProduction();
       
       // Realizar acciones con el bot
       // Validar invariantes con los oráculos de negocio
       expect(sandbox.state.inventory.length).toBeGreaterThan(0);
     });
   });
   ```
3. **Ejecuta la suite** con `npm run test:agent` para verificar que pase en verde y con 0 requests a producción.
