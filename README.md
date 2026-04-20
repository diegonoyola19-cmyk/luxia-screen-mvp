# LUXIA Screen MVP

Aplicacion web MVP para calcular materiales y merma de cortinas, iniciando con el producto **Cortina Screen**.

## Stack

- React
- Vite
- TypeScript
- Estado local con React
- Persistencia inicial con `localStorage`

## Como ejecutar el proyecto

1. Instala [Node.js](https://nodejs.org/) 20 o superior.
2. Instala las dependencias:

```bash
npm install
```

3. Inicia el entorno de desarrollo:

```bash
npm run dev
```

4. Abre la URL que te muestre Vite en el navegador.

## Scripts disponibles

- `npm run dev`: levanta el proyecto en modo desarrollo
- `npm run build`: genera el build de produccion
- `npm run preview`: sirve el build localmente

## Estructura principal

```text
src/
  app/
    App.tsx
  components/
    ui/
      Button.tsx
      Card.tsx
  domain/
    curtains/
      constants.ts
      screen.ts
      types.ts
  features/
    calculadora-screen/
      components/
        CalculatorForm.tsx
        HistoryPanel.tsx
        ResultsPanel.tsx
      ScreenCalculatorPage.tsx
  lib/
    format.ts
    storage.ts
  styles/
    global.css
```

## Reglas implementadas para Screen

- tubo = ancho terminado
- bottomrail = ancho terminado
- cadena = alto terminado x 2
- alto de corte = alto terminado + 0.20 m
- rollo 2.50 m si ancho <= 2.50 m
- rollo 3.00 m si ancho > 2.50 m y ancho <= 3.00 m
- error si ancho > 3.00 m
- conversion a pies = metros x 3.28084
- conversion a yd² = m² x 1.19599

## Donde extender el sistema

- Nuevos tipos de cortina:
  agrega nuevos tipos y opciones en `src/domain/curtains/types.ts` y `src/domain/curtains/constants.ts`.
- Nuevas reglas de calculo:
  crea una utilidad similar a `src/domain/curtains/screen.ts`.
- Nueva UI por producto:
  crea un nuevo feature dentro de `src/features`.

## Integracion con la base de precios

La base `BASE PARA PRECIOS (1).xlsx` ahora se puede convertir a un catalogo JSON del proyecto.

1. Coloca el archivo Excel en la ruta esperada o pasa una ruta manual.
2. Ejecuta:

```bash
npm run import:prices
```

O bien:

```bash
node scripts/import-price-base.mjs "C:\\ruta\\a\\tu\\archivo.xlsx"
```

Esto genera `src/data/luxia-price-catalog.json` usando las hojas `LUXIA` y `DATA`.

### Que hace hoy esta integracion

- importa codigos, descripcion, costos, precios, comentarios e imagenes
- detecta telas `Screen` y su ancho desde la descripcion
- sugiere costos por yarda cuadrada para rollos de `2.50 m` y `3.00 m`
- permite aplicar esos costos desde la vista `Bodega`

### Que no hace aun

- no reemplaza `localStorage` por una base de datos real
- no sincroniza cambios del Excel automaticamente
- no controla existencias reales de inventario desde el archivo fuente

## Notas

- El historial de calculos y el borrador del formulario se guardan en `localStorage`.
- La arquitectura ya esta preparada para conectar luego un backend o base de datos reemplazando la capa de `src/lib/storage.ts`.
