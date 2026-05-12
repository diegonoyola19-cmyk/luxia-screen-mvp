import json, copy

# ──────────────────────────────────────────────
# 1. Leer el archivo original (UTF-16 LE con BOM)
# ──────────────────────────────────────────────
with open("docs/roller-bom-rules-new.json", encoding="utf-16-le") as f:
    raw = f.read().lstrip("\ufeff")   # quitar BOM si existe

data = json.loads(raw)

# ──────────────────────────────────────────────
# 2. Eliminar fila de metadata residual (header)
# ──────────────────────────────────────────────
data = [row for row in data if row.get("rango_min_m") is not None]

# ──────────────────────────────────────────────
# 3. Helpers para la separación del campo "valor"
# ──────────────────────────────────────────────
def split_valor(comp):
    """Reemplaza 'valor' por las tres llaves semánticas."""
    c = dict(comp)
    v = c.pop("valor", None)
    tipo = c.get("tipo_calculo", "")
    if "Descuento" in tipo:
        c["valor_descuento_mm"]   = v
        c["cantidad_fija"]        = None
        c["factor_multiplicador"] = None
    elif "Cantidad fija" in tipo:
        c["valor_descuento_mm"]   = None
        c["cantidad_fija"]        = v
        c["factor_multiplicador"] = None
    elif "Factor" in tipo:
        c["valor_descuento_mm"]   = None
        c["cantidad_fija"]        = None
        c["factor_multiplicador"] = v
    else:
        # Fallback: conservar en cantidad_fija
        c["valor_descuento_mm"]   = None
        c["cantidad_fija"]        = v
        c["factor_multiplicador"] = None
    return c

# ──────────────────────────────────────────────
# 4. Resolver solapamientos por categoría
#
#    Categorías afectadas:
#      "Roller Pin EndPlug" y "Roller Bracket Doble"
#
#    Patrón:
#      Hay UN bloque base [0, 2.2] con componentes principales (sin End Plug)
#      + UN bloque parcial [0, 1.5] que solo tiene el End Plug pequeño
#      + UN bloque parcial [1.51, 2.4] que solo tiene el End Plug grande
#      + (posiblemente ya existe el bloque [2.201, 2.4] con todos los componentes)
#
#    Resultado esperado (rangos mutuamente excluyentes):
#      [0,    1.5]  = base_componentes + end_plug_pequeño
#      [1.501, 2.2] = base_componentes + end_plug_grande   ← rango nuevo
#      [2.201, 2.4] = ya existe como bloque separado completo → solo aplicar split_valor
#      [2.401, 2.8] = ya existe
# ──────────────────────────────────────────────

CATEGORIAS_OVERLAP = {"Roller Pin EndPlug", "Roller Bracket Doble"}

# Separar bloques por categoría para analizarlos
from collections import defaultdict
by_cat = defaultdict(list)
for row in data:
    by_cat[row["categoria"]].append(row)

result = []

for cat, rows in by_cat.items():
    if cat not in CATEGORIAS_OVERLAP:
        # Sin solapamiento: solo aplicar split_valor y agregar
        for row in rows:
            new_row = dict(row)
            new_row["componentes"] = [split_valor(c) for c in row["componentes"]]
            result.append(new_row)
        continue

    # ── Para las categorías con solapamiento ──

    # Identificar los bloques por su rol
    bloque_base        = None   # [0, 2.2] — componentes principales
    bloque_ep_pequeno  = None   # [0, 1.5] — solo End Plug pequeño
    bloque_ep_grande   = None   # [1.51, 2.4] — solo End Plug grande
    otros              = []     # bloques autónomos (2.201+, 2.401+, etc.)

    for row in rows:
        rmin = row["rango_min_m"]
        rmax = row["rango_max_m"]
        comps = row["componentes"]

        if rmin == 0 and rmax == 2.2:
            bloque_base = row
        elif rmin == 0 and rmax == 1.5 and len(comps) == 1:
            bloque_ep_pequeno = row
        elif rmin == 1.51 and rmax == 2.4 and len(comps) == 1:
            bloque_ep_grande = row
        else:
            otros.append(row)

    if bloque_base is None:
        # No hay patrón esperado; agregar tal cual
        for row in rows:
            new_row = dict(row)
            new_row["componentes"] = [split_valor(c) for c in row["componentes"]]
            result.append(new_row)
        continue

    base_comps = bloque_base["componentes"]

    # ── Bloque 1: [0, 1.5] = base + End Plug pequeño ──
    ep_pequeno_comps = bloque_ep_pequeno["componentes"] if bloque_ep_pequeno else []
    bloque_1 = {
        "categoria":    cat,
        "rango_min_m":  0,
        "rango_max_m":  1.5,
        "componentes":  [split_valor(c) for c in base_comps + ep_pequeno_comps]
    }
    result.append(bloque_1)

    # ── Bloque 2: [1.501, 2.2] = base + End Plug grande ──
    ep_grande_comps = bloque_ep_grande["componentes"] if bloque_ep_grande else []
    bloque_2 = {
        "categoria":    cat,
        "rango_min_m":  1.501,
        "rango_max_m":  2.2,
        "componentes":  [split_valor(c) for c in base_comps + ep_grande_comps]
    }
    result.append(bloque_2)

    # ── Bloques autónomos (>= 2.201): eliminar el [1.51, 2.4] que ya fue absorbido,
    #    y procesar los demás ──
    for row in otros:
        # Descartar el bloque [2.201, 2.4] si ya tiene solo End Plug grande
        # (ha sido absorbido por bloque_2); si tiene todos los componentes, conservar.
        new_row = dict(row)
        new_row["componentes"] = [split_valor(c) for c in row["componentes"]]
        result.append(new_row)


# ──────────────────────────────────────────────
# 5. Guardar el JSON refactorizado (UTF-8, sin BOM)
# ──────────────────────────────────────────────
output_path = "docs/roller-bom-rules-refactored.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f"OK Refactorizacion completada -> {output_path}")
print(f"   Bloques en el resultado: {len(result)}")
for row in result:
    print(f"   [{row['rango_min_m']:>6} - {row['rango_max_m']:>5}]  {row['categoria']}  ({len(row['componentes'])} componentes)")
