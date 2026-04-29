# LUXIA - Documento de Parámetros para Integración IMS

Fecha: 26 de abril de 2026  
Aplicación publicada: https://luxia-screen-mvp.vercel.app  
Nombre visible de la aplicación: LUXIA

## 1. Objetivo

Este documento resume la lógica funcional y los parámetros de cálculo de la aplicación LUXIA para evaluar cómo traducirla e integrarla dentro del sistema IMS.

La aplicación actual fue construida como una herramienta interna de cálculo, producción, bodega y descargo para cortinas tipo Roller/Screen. El objetivo para IMS no es copiar Vercel ni la infraestructura React, sino trasladar la lógica de negocio: cálculo de materiales, reglas de corte, retazos, recetas, descargos y estados de órdenes.

## 2. Alcance Funcional Actual

La herramienta cubre estos módulos principales:

1. Cálculo de cortina Roller/Screen.
2. Agrupación de cortinas para corte conjunto.
3. Selección de tela por familia, apertura y color.
4. Cálculo de tela descargada, tela útil y merma.
5. Registro y sugerencia de retazos reutilizables.
6. Inventario básico de rollos, retazos, tubos, bottoms y componentes.
7. Configuración de recetas por tono.
8. Exportación de hoja de descargo compatible con formato Sage.
9. Estados de orden: Pendiente y Completada.

## 3. Parámetros Globales

| Parámetro | Valor actual | Uso |
|---|---:|---|
| Conversión metros a pies | `3.28084` | Tubo, bottom y cadena |
| Conversión m2 a sqyd | `1.20` | Tela para descargo |
| Extra de alto de corte | `0.30 m` | Se suma al alto terminado |
| Encuadre base de tela | `0.10 m` | Se suma al ancho y alto de corte |
| Separación entre piezas en corte conjunto | `0.05 m` | Separación entre cortinas al cortar juntas |
| Ancho pequeño de rollo | `2.50 m` | Rollo disponible |
| Ancho grande de rollo | `3.00 m` | Rollo disponible |
| Descuento tubo/bottom | `0.03 m` | Tubo y bottom se cortan un poco menor al ancho terminado |
| Barra estándar tubo/bottom | `19 ft` | Descargo completo por barra usada |
| Retazo útil de tela | ambos lados `>= 1.00 m` | Si no cumple, no se guarda en bodega |
| Sobrante útil tubo/bottom | `>= 1.00 m` | Si cumple, se guarda como sobrante |

## 4. Datos de Entrada para Cálculo

Cada cortina necesita:

| Campo | Descripción |
|---|---|
| Tipo de cortina | Actualmente solo Roller/Screen |
| Familia de tela | Ejemplo: Blackout, Screen, etc. |
| Apertura | Ejemplo: 1%, 3%, 5%, según catálogo |
| Color | Color de la tela |
| Ancho terminado | En metros |
| Alto terminado | En metros |

La tela seleccionada debe resolverse contra catálogo por:

1. Familia.
2. Apertura.
3. Color.
4. Ancho de rollo disponible.
5. Código de item/Sage.

## 5. Cálculo Individual de Tela

### 5.1 Orientación Normal

La orientación normal es la regla principal.

```text
ancho_corte = ancho_terminado + 0.10
alto_corte = alto_terminado + extra_alto_corte + 0.10
```

Con los valores actuales:

```text
alto_corte = alto_terminado + 0.30 + 0.10
alto_corte = alto_terminado + 0.40
```

El sistema busca el rollo más pequeño donde quepa el `ancho_corte`.

```text
rollo_recomendado = primer rollo disponible donde ancho_rollo >= ancho_corte
```

### 5.2 Orientación Volteada

La orientación volteada solo se contempla para casos raros donde por fabricación conviene rotar la cortina, normalmente cuando la cortina supera el ancho regular del rollo.

```text
ancho_corte_volteado = alto_terminado + extra_alto_corte + 0.10
alto_corte_volteado = ancho_terminado + 0.10
```

Regla de decisión:

1. Si normal y volteada caben, se prefiere normal.
2. Si volteada permite usar un rollo más pequeño, se permite volteada.
3. Los retazos no se rotan manualmente.

## 6. Cálculo de Corte en Lote

Cuando varias cortinas del mismo material se agrupan, el sistema intenta cortarlas juntas.

Para cada cortina:

```text
ancho_corte_item = ancho_terminado + 0.10
alto_corte_item = alto_terminado + 0.30 + 0.10
```

Para el grupo:

```text
ancho_total_corte = suma(ancho_corte_item) + separación_entre_piezas
alto_grupo = mayor(alto_corte_item)
rollo_grupo = primer rollo disponible donde ancho_rollo >= ancho_total_corte
```

La separación entre piezas es:

```text
0.05 m por cada pieza adicional
```

Ejemplo con 2 cortinas:

```text
ancho_total_corte =
  ancho_corte_1 +
  ancho_corte_2 +
  0.05
```

## 7. Descargo de Tela

La tela se descarga por el ancho completo del rollo usado, no por el ancho parcial ocupado.

```text
tela_descargada_m2 = ancho_rollo * alto_grupo
tela_descargada_sqyd = tela_descargada_m2 * 1.20
```

La tela útil es la parte ocupada por las cortinas dentro del corte:

```text
tela_util_m2 = ancho_total_corte * alto_grupo
merma_m2 = tela_descargada_m2 - tela_util_m2
```

La hoja de descargo usa la cantidad en `sqyd`.

### Ejemplo

Cortinas:

```text
1.25 x 1.35 m
1.35 x 1.25 m
```

Cálculo:

```text
ancho_corte_1 = 1.25 + 0.10 = 1.35 m
ancho_corte_2 = 1.35 + 0.10 = 1.45 m
separación = 0.05 m
ancho_total = 2.85 m

alto_corte_1 = 1.35 + 0.30 + 0.10 = 1.75 m
alto_corte_2 = 1.25 + 0.30 + 0.10 = 1.65 m
alto_grupo = 1.75 m

rollo = 3.00 m
tela_descargada_m2 = 3.00 * 1.75 = 5.25 m2
tela_descargada_sqyd = 5.25 * 1.20 = 6.30 sqyd
```

## 8. Retazos de Tela

### 8.1 Regla de Retazo Útil

Un retazo de tela solo se guarda en bodega si ambos lados cumplen:

```text
ancho_retazo >= 1.00 m
alto_retazo >= 1.00 m
```

Ejemplos:

| Retazo | Resultado |
|---|---|
| `0.80 x 2.35 m` | No se guarda |
| `1.10 x 2.35 m` | Sí se guarda |

### 8.2 Compatibilidad de Retazo

Un retazo se sugiere solo si:

1. Es del mismo material:
   - familia,
   - apertura,
   - color.
2. Está disponible.
3. La cortina cabe directamente en sus dimensiones.

Regla:

```text
retazo.ancho >= ancho_corte
retazo.alto >= alto_corte
```

No se permite sugerir retazo si solo cabe rotándolo.

### 8.3 Uso de Retazo

Si una cortina usa retazo:

1. No consume rollo nuevo.
2. No genera retazo nuevo.
3. La cantidad de tela en el descargo Sage es `0`.
4. El retazo usado se marca como no disponible.

## 9. Tubo y Bottom

### 9.1 Cálculo del Largo Real

Para tubo y bottom:

```text
largo_lineal_m = ancho_terminado - 0.03
largo_lineal_ft = largo_lineal_m * 3.28084
```

### 9.2 Descargo Contable

La regla actual de descargo contable replica el criterio de tela: se descarga la barra completa si se tuvo que tocar una barra.

```text
barra_estándar = 19 ft
```

Si varias cortinas caben en la misma barra, se descarga una barra completa para el conjunto, no una barra por cortina.

Ejemplo:

```text
uso_total_tubo = 16.90 ft
barra_tocada = 19.00 ft
descargo_sage = 19.00 ft
sobrante = 2.10 ft
```

El sobrante puede quedar en bodega como reutilizable si cumple la regla de utilidad.

### 9.3 Sobrante de Tubo/Bottom

Si el sobrante de tubo o bottom es:

```text
sobrante >= 1.00 m
```

entonces se guarda como sobrante reutilizable.

Si no cumple, queda consumido dentro del descargo completo.

## 10. Cadena

La cadena se calcula como:

```text
cadena_m = alto_terminado * multiplicador_cadena
cadena_ft = cadena_m * 3.28084
```

Valor actual:

```text
multiplicador_cadena = 2
```

## 11. Componentes Fijos

La receta estándar contempla:

| Componente | Cantidad |
|---|---:|
| Soporte Lado de Control | 1 |
| Soporte Lado de End Plug | 1 |
| Control | 1 |
| End Plug | 1 |
| Chapita | 1 |
| Pesa de Cadena | 1 |
| Tapaderas de Bottom | 2 |
| Topes de Cadena | 2 |

Estos componentes pueden mapearse por tono/color mediante receta.

## 12. Recetas y Tonos

La aplicación usa grupos de tono para resolver los componentes correctos:

1. White.
2. Bronze / Café.
3. Ivory / Beige.
4. Grey / Gris.

Cada componente de receta puede tener un item distinto por tono.

Categorías manejadas:

| Categoría | Uso |
|---|---|
| fabric | Tela |
| tube | Tubo |
| bottom | Bottom |
| chain | Cadena |
| control | Control |
| bracket | Soporte |
| endPlug | End Plug |
| bottomCap | Tapadera bottom |
| chainStop | Tope cadena |
| chainWeight | Pesa cadena |
| other | Otros |

La receta genera líneas de materiales con:

1. Código interno.
2. Código Sage.
3. Descripción.
4. Categoría.
5. Cantidad.
6. Unidad.
7. Costo unitario.
8. Costo total.

## 13. Hoja de Descargo Sage

La exportación genera un archivo Excel `OrderEntrySAGE_LUXIA_YYYY-MM-DD.xlsx`.

La hoja principal de detalle consolida materiales por código Sage.

Campos principales:

| Campo Sage | Valor |
|---|---|
| ORDUNIQ | `PRODUC` |
| ORDNUMBER | `*** NEW ***` |
| CUSTOMER | `PRODUC` |
| TYPE | `1` |
| LOCATION | `1` |
| LINETYPE | `1` |
| ITEM | Código Sage / Item |
| QTYORDERED | Cantidad consolidada |

Reglas importantes:

1. No exporta líneas con cantidad `0`.
2. Consolida materiales iguales por código.
3. Solo exporta órdenes en estado Pendiente.
4. Al exportar, las órdenes pasan a estado Completada.

## 14. Estados de Orden

Las órdenes tienen dos estados:

| Estado visible | Estado lógico | Comportamiento |
|---|---|---|
| Pendiente | `pending` | Se incluye en próximos descargos Sage |
| Completada | `sent_to_sage` | No se incluye en futuros descargos |

Las órdenes antiguas sin estado se consideran Pendiente.

## 15. Bodega / Inventario

La bodega maneja:

1. Rollos de tela.
2. Retazos de tela.
3. Barras de tubo.
4. Sobrantes de tubo.
5. Barras de bottom.
6. Sobrantes de bottom.
7. Componentes.

Movimientos principales:

| Acción | Descripción |
|---|---|
| create_order | Se crea una orden |
| consume | Se consume material |
| create_scrap | Se crea retazo/sobrante reutilizable |
| use_scrap | Se usa retazo existente |
| discard | Se descarta sobrante no útil |

## 16. Reglas de Integración al IMS

Para implementar esto dentro del IMS, se recomienda separar la lógica en estos servicios o módulos:

### 16.1 Servicio de Cálculo

Debe recibir:

1. Medidas de cortina.
2. Tela seleccionada.
3. Configuración de reglas.
4. Rollos disponibles.
5. Retazos disponibles.

Debe devolver:

1. Rollo recomendado.
2. Alto de corte.
3. Ancho ocupado.
4. Tela descargada.
5. Merma.
6. Retazo generado, si aplica.
7. Tubo, bottom y cadena.
8. Componentes de receta.

### 16.2 Servicio de Retazos

Debe:

1. Guardar solo retazos útiles.
2. Sugerir retazos compatibles sin rotación.
3. Marcar retazo como usado al guardar orden.
4. Evitar descarga de tela nueva si se usa retazo.

### 16.3 Servicio de Recetas

Debe:

1. Mapear tela a tono.
2. Resolver componente por tono.
3. Calcular cantidades por regla:
   - fija,
   - pies de tubo,
   - pies de bottom,
   - pies de cadena.
4. Generar líneas de descargo.

### 16.4 Servicio de Descargo

Debe:

1. Tomar solo órdenes Pendientes.
2. Consolidar por código Sage.
3. Exportar o insertar en el formato requerido por IMS/Sage.
4. Cambiar órdenes exportadas a Completada.

## 17. Prompt Base para Traducir al IMS

Este texto puede servir como prompt o especificación base para el equipo que traduzca la lógica al lenguaje del IMS:

```text
Implementar en IMS una calculadora de materiales para cortinas Roller/Screen.

Entradas:
- familia de tela,
- apertura,
- color,
- ancho terminado en metros,
- alto terminado en metros,
- número de orden.

Reglas:
- ancho_corte = ancho_terminado + 0.10
- alto_corte = alto_terminado + 0.30 + 0.10
- escoger el rollo más pequeño donde quepa el ancho de corte
- si varias cortinas del mismo material se agrupan, sumar anchos de corte y agregar 0.05 m entre piezas
- usar el mayor alto de corte del grupo
- descargar tela por ancho completo del rollo: ancho_rollo * alto_grupo
- convertir m2 a sqyd con multiplicador 1.20
- guardar retazo de tela solo si ancho >= 1.00 m y alto >= 1.00 m
- sugerir retazos solo si mismo material y cabe directo sin rotación
- si se usa retazo, no descargar tela nueva y marcar retazo como usado
- tubo/bottom = (ancho_terminado - 0.03) * 3.28084
- tubo y bottom se descargan por barra completa de 19 ft por cada barra tocada
- guardar sobrante lineal si es >= 1.00 m
- cadena = alto_terminado * 2 * 3.28084
- resolver componentes por receta y tono
- exportar solo órdenes pendientes
- al exportar a Sage/IMS, marcar órdenes como completadas
```

## 18. Pendientes a Definir con IMS

1. Si IMS manejará bodega propia de retazos o solo descargo contable.
2. Si los sobrantes útiles de tubo/bottom deben quedar visibles para selección futura.
3. Si el descargo Sage se seguirá exportando en Excel o se insertará directo en IMS.
4. Si los códigos Sage actuales serán los mismos códigos maestros del IMS.
5. Si las órdenes de venta del Excel de ventas alimentarán automáticamente esta calculadora.
6. Quién tendrá permiso para cambiar recetas y códigos.
7. Si se necesita auditoría de cambios por usuario.

## 19. Resumen Ejecutivo

La lógica clave para portar al IMS es:

1. La tela se descarga por rollo completo usado en el corte, no por área parcial.
2. Los retazos de tela solo se guardan si son útiles y se sugieren sin rotación.
3. Tubo y bottom se descargan por barra completa de 19 ft, aunque quede sobrante.
4. Las recetas convierten cada orden en líneas de materiales por código Sage.
5. Las órdenes completadas no vuelven a entrar en descargos futuros.

Con estos parámetros, IMS puede replicar la operación sin depender de Vercel, React o Node en producción.
