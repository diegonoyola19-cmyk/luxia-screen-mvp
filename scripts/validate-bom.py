import json
from itertools import combinations

with open("docs/roller-bom-rules-refactored.json", encoding="utf-8") as f:
    data = json.load(f)

errores = []

# 1. Verificar que ningún componente tenga la llave 'valor' y que tenga las 3 nuevas
for i, row in enumerate(data):
    for j, c in enumerate(row["componentes"]):
        if "valor" in c:
            errores.append("Bloque %d comp %d: aun tiene llave 'valor'" % (i, j))
        for k in ["valor_descuento_mm", "cantidad_fija", "factor_multiplicador"]:
            if k not in c:
                errores.append("Bloque %d comp %d: falta llave '%s'" % (i, j, k))

# 2. Verificar rangos mutuamente excluyentes por categoría
by_cat = {}
for row in data:
    by_cat.setdefault(row["categoria"], []).append(row)

for cat, rows in by_cat.items():
    for a, b in combinations(rows, 2):
        overlap_start = max(a["rango_min_m"], b["rango_min_m"])
        overlap_end   = min(a["rango_max_m"], b["rango_max_m"])
        if overlap_start < overlap_end:
            msg = "SOLAPAMIENTO en [%s]: [%s-%s] x [%s-%s]" % (
                cat,
                a["rango_min_m"], a["rango_max_m"],
                b["rango_min_m"], b["rango_max_m"]
            )
            errores.append(msg)

# 3. Verificar que no existe el bloque header (rango_min_m = null)
for row in data:
    if row.get("rango_min_m") is None:
        errores.append("Existe bloque de metadata residual (header)")

if errores:
    for e in errores:
        print("ERROR:", e)
else:
    print("VALIDACION OK: sin errores, sin solapamientos, sin llave 'valor', sin header residual")

print("Total bloques: %d" % len(data))
for row in data:
    print("  [%s - %s]  %-30s (%d componentes)" % (
        str(row["rango_min_m"]).rjust(6),
        str(row["rango_max_m"]).ljust(5),
        row["categoria"],
        len(row["componentes"])
    ))
