# Reglas actuales de calculo Rollux / Roller

Fecha de revision: 2026-04-27

Este documento resume las reglas que sigue actualmente la app para calcular cortinas Rollux/Roller. Esta basado en la logica del codigo actual, principalmente en:

- `src/domain/curtains/screen.ts`
- `src/domain/curtains/constants.ts`
- `src/domain/curtains/cuttingOptimizer.ts`
- `src/features/calculadora-screen/store/slices/orderSlice.ts`
- `src/lib/recipeResolver.ts`
- `src/lib/inventory.ts`
- `src/lib/priceCatalog.ts`

## 1. Tipo de producto

La app maneja actualmente un solo tipo de cortina:

- Tipo interno: `screen`
- Etiqueta en interfaz: `Roller`

Aunque parte del codigo usa el nombre `Screen`, las reglas aplican al flujo Roller/Rollux que esta en la calculadora.

## 2. Datos de entrada

Para calcular una cortina se usan estos datos:

- Familia de tela.
- Apertura.
- Color.
- Ancho terminado en metros.
- Alto terminado en metros.

La familia, apertura y color salen del catalogo `src/data/luxia-roller-catalog.json`.

## 3. Validaciones de medidas

La app valida que:

- El tipo de cortina exista.
- La familia de tela no este vacia.
- La apertura no este vacia.
- El color no este vacio.
- El ancho sea mayor que 0.
- El alto sea mayor que 0.
- El ancho no exceda `5.79 m`, equivalente a `19 ft`, que es el ancho maximo de tubo definido en el calculo.

En la validacion visual del formulario tambien se manejan estos rangos:

- Ancho: de `0.30 m` a `6.00 m`.
- Alto: de `0.30 m` a `4.00 m`.

Nota: el limite fuerte del calculo individual para ancho es `5.79 m`.

## 4. Reglas configurables por defecto

La app tiene una configuracion base que puede guardarse en `localStorage`:

| Regla | Valor por defecto |
|---|---:|
| Extra de alto de corte | `0.30 m` |
| Multiplicador de cadena | `2` |
| Rollo pequeno | `2.50 m` |
| Rollo grande | `3.00 m` |
| Ancho maximo configurable | `3.00 m` |

Importante: para seleccionar rollo, la app prioriza los anchos disponibles reales del catalogo para la tela seleccionada. Si no hay anchos disponibles, usa como respaldo `2.50 m` y `3.00 m`.

## 5. Margenes de corte

La app agrega margen de encuadre de tela:

- Al ancho terminado se le suma `0.10 m`.
- Al alto terminado se le suma el extra configurable de alto y otros `0.10 m`.

Formula en orientacion normal:

```text
ancho de corte = ancho terminado + 0.10
largo de corte = alto terminado + extra alto corte + 0.10
```

Con valores por defecto:

```text
largo de corte = alto terminado + 0.30 + 0.10
largo de corte = alto terminado + 0.40
```

## 6. Orientacion normal vs volteada

La app prueba dos orientaciones:

### Normal

```text
ancho de corte = ancho terminado + 0.10
largo de corte = alto terminado + extra alto corte + 0.10
```

### Volteada

En orientacion volteada, el alto con margen se acomoda contra el ancho del rollo:

```text
ancho ocupado en rollo = alto terminado + extra alto corte + 0.10
largo de corte = ancho terminado + 0.10
```

## 7. Seleccion de rollo

Para cada orientacion valida, la app selecciona el rollo mas pequeno donde quepa el ancho ocupado.

```text
rollo recomendado = menor ancho disponible >= ancho ocupado
```

Si no existe ningun rollo disponible donde quepa, esa orientacion se descarta.

Si ambas orientaciones caben:

1. La app elige `volteada` solo si permite usar un rollo mas pequeno que la orientacion normal.
2. Si ambas usan el mismo rollo, o la normal usa uno menor, la app prefiere `normal` por el hilo de la tela.

Si solo una orientacion cabe, usa esa.

Si ninguna cabe, muestra error:

```text
No hay una orientacion valida para estas medidas.
```

## 8. Calculo de tela

Una vez elegida la orientacion:

```text
tela descargada m2 = ancho de rollo recomendado * largo de corte
tela util m2 = ancho ocupado * largo de corte
merma m2 = tela descargada m2 - tela util m2
```

La app convierte metros cuadrados a yardas cuadradas con:

```text
1 m2 = 1.2 yd2
```

Por tanto:

```text
tela descargada yd2 = tela descargada m2 * 1.2
tela util yd2 = tela util m2 * 1.2
merma yd2 = merma m2 * 1.2
```

Porcentaje de merma:

```text
merma % = merma m2 / tela descargada m2 * 100
```

## 9. Pieza de retazo generada

Cuando queda ancho libre en el rollo, la app registra el retazo como:

```text
ancho retazo = ancho rollo recomendado - ancho ocupado
alto retazo = largo de corte
```

En inventario, un retazo de tela solo se crea como reutilizable si ambos lados miden al menos:

```text
1.00 m
```

## 10. Tubo y bottom

Para tubo y bottom se usa el ancho terminado con un descuento lineal:

```text
descuento lineal = 0.03 m
tubo m = max(ancho terminado - 0.03, 0)
bottom m = max(ancho terminado - 0.03, 0)
```

Conversion a pies:

```text
1 m = 3.28084 ft
```

```text
tubo ft = tubo m * 3.28084
bottom ft = bottom m * 3.28084
```

## 11. Tubo reforzado

La app marca recomendacion de tubo reforzado cuando:

```text
ancho terminado > 3.00 m
```

Mensaje actual:

```text
Requiere tubo reforzado. Produccion debe definir si corresponde tubo de 45 mm o 63 mm.
```

## 12. Cadena

La cadena se calcula con el alto terminado:

```text
cadena m = alto terminado * multiplicador de cadena
```

Con la regla por defecto:

```text
cadena m = alto terminado * 2
```

Tambien se convierte a pies:

```text
cadena ft = cadena m * 3.28084
```

## 13. Componentes fijos base

La configuracion base incluye estos componentes:

| Componente | Cantidad | Unidad |
|---|---:|---|
| Soporte Lado de Control | 1 | u |
| Soporte Lado de End Plug | 1 | u |
| Control | 1 | u |
| End Plug | 1 | u |
| Chapita | 1 | u |
| Pesa de Cadena | 1 | u |
| Tapaderas de Bottom | 2 | u |
| Topes de Cadena | 2 | u |

En el flujo nuevo de orden, estos componentes se reemplazan o enriquecen con la receta Screen/Roller configurada por items del catalogo.

## 14. Receta Screen / Roller

La receta por defecto se llama:

```text
Screen / Roller estandar
```

Incluye estas reglas de cantidad:

| Componente | Categoria | Modo de cantidad |
|---|---|---|
| Tubo | tube | Pies de tubo |
| Bottom | bottom | Pies de bottom |
| Cadena | chain | Pies de cadena |
| Soporte Lado de Control | bracket | Fijo 1 |
| Soporte Lado de End Plug | bracket | Fijo 1 |
| Control | control | Fijo 1 |
| End Plug | endPlug | Fijo 1 |
| Chapita | other | Fijo 1 |
| Pesa de Cadena | chainWeight | Fijo 1 |
| Tapaderas de Bottom | bottomCap | Fijo 2 |
| Topes de Cadena | chainStop | Fijo 2 |

Cada componente se asigna por tono de tela:

- `white`
- `bronze`
- `ivory`
- `grey`

Si falta un item de receta para el tono correspondiente, la app no guarda la orden y muestra advertencia.

## 15. Tono de tela para componentes

La app determina el tono de tela asi:

1. Primero busca una regla exacta configurada para familia + apertura + color.
2. Si no existe regla exacta, infiere el tono desde el nombre del color.

Inferencia actual:

- `grey`: colores con `grey`, `gray`, `smoke`, `stone`, `silver`.
- `ivory`: colores con `beige`, `bisque`, `sand`, `taupe`, `linen`, `ivory`, `tan`, `custard`, `fawn`.
- `bronze`: colores con `bronze`, `brown`, `chocolate`, `coffee`, `ebony`, `black`, `gold`.
- Si no coincide con nada, usa `white`.

## 16. Costos de tela

El costo por yarda cuadrada viene del catalogo de tela seleccionado:

```text
costo tela descargada = yd2 descargadas * costo por yd2
costo tela util = yd2 utiles * costo por yd2
costo merma = yd2 merma * costo por yd2
```

Si se reutiliza retazo, la tela descargada se vuelve `0` y la app registra un ahorro equivalente al calculo original:

```text
ahorro = yd2 que se habrian descargado * costo por yd2
```

## 17. Reutilizacion de retazos

La app puede sugerir retazos reutilizables cuando:

- El retazo tiene la misma familia, apertura y color de la tela seleccionada.
- El ancho del retazo es mayor o igual al ancho ocupado requerido.
- El alto del retazo es mayor o igual al largo de corte requerido.

Los retazos sugeridos se ordenan del area menor a la mayor, para usar primero el retazo mas ajustado.

Cuando se usa un retazo:

- No se descarga tela nueva.
- No se genera nueva merma de tela.
- Se registra ahorro de tela.
- El retazo usado se marca como utilizado en inventario si existe alli.

## 18. Optimizacion por lote

Cuando se agregan varias cortinas a producir, la app agrupa por tela y color para optimizar cortes.

Para cada pieza del lote:

```text
ancho de corte individual = ancho terminado + 0.10
alto de corte individual = alto terminado + extra alto corte + 0.10
```

Entre piezas del mismo grupo agrega:

```text
separacion entre piezas = 0.05 m
```

Para un grupo:

```text
ancho total grupo = suma de anchos de corte + separaciones
alto grupo = alto de corte mayor del grupo
```

La app selecciona el rollo mas pequeno donde quepa el ancho total del grupo.

Si hay hasta 7 items, busca combinaciones de grupos para minimizar la merma total. Si hay mas de 7 items, usa una heuristica `First Fit Decreasing` para evitar que la app se vuelva lenta.

## 19. Distribucion de tela en orden guardada

Al guardar una orden, si hay grupos optimizados:

- La merma del grupo se reparte proporcionalmente entre las cortinas segun su ancho de corte.
- Solo la primera cortina del grupo queda como propietaria del retazo fisico generado.
- Si una cortina viene de retazo reutilizado, sus yd2 descargadas y merma quedan en `0`.

## 20. Barras de tubo y bottom en inventario

Para inventario, las barras de tubo y bottom se manejan como barras de:

```text
19 ft
```

Al cortar tubo o bottom se agrega perdida de corte:

```text
perdida de corte = 0.01 m
```

Si sobra una pieza lineal de al menos:

```text
1.00 m
```

se guarda como sobrante reutilizable. Si sobra menos, se registra como descarte.

## 21. Descargo de inventario

Cuando se guarda una orden, la app:

1. Registra movimiento de creacion de orden.
2. Consume tela del rollo disponible que coincida con ancho, largo suficiente y preferiblemente con la tela seleccionada.
3. Crea retazo de tela si cumple minimo reutilizable.
4. Consume tubo.
5. Consume bottom.
6. Consume componentes fijos o de receta.

## 22. Reglas que existen pero no dominan el calculo actual

Hay una regla configurable llamada `maxWidthMeters`, con valor default `3.00 m`. Actualmente la seleccion real de rollo depende mas de:

- Los anchos disponibles en el catalogo de la tela.
- El limite hard-coded de ancho maximo de tubo de `5.79 m`.
- La capacidad de cada orientacion de caber en algun rollo disponible.

Por eso, cambiar `maxWidthMeters` no reemplaza por si solo la lista de anchos disponibles del catalogo.

## 23. Resumen rapido de formulas principales

```text
normal.anchoCorte = ancho + 0.10
normal.largoCorte = alto + extraAlto + 0.10

volteada.anchoOcupado = alto + extraAlto + 0.10
volteada.largoCorte = ancho + 0.10

rollo = menor ancho disponible donde quepa anchoOcupado

telaDescargadaM2 = rollo * largoCorte
telaUtilM2 = anchoOcupado * largoCorte
mermaM2 = telaDescargadaM2 - telaUtilM2

yd2 = m2 * 1.2

tuboM = max(ancho - 0.03, 0)
bottomM = max(ancho - 0.03, 0)
cadenaM = alto * 2

pies = metros * 3.28084
```

