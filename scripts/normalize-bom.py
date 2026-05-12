"""
normalize-bom.py
Luxia MES — Roller BOM Rules normalizer
Transforms roller-bom-rules-refactored.json into a production-ready
TypeScript-friendly structure.
"""

import json, re

# ─────────────────────────────────────────────
# 1. Load source (already overlap-resolved JSON)
# ─────────────────────────────────────────────
with open("docs/roller-bom-rules-refactored.json", encoding="utf-8") as f:
    raw_rules = json.load(f)

# ─────────────────────────────────────────────
# 2. Helpers — calculation object builder
# ─────────────────────────────────────────────
def build_calculation(comp: dict) -> dict:
    tipo = comp.get("tipo_calculo", "")

    if tipo == "Descuento (mm)":
        v = comp.get("valor_descuento_mm") or comp.get("valor")
        return {
            "type":       "widthMinus",
            "value":      v,
            "unit":       "mm",
            "resultUnit": "m"
        }

    if tipo == "Cantidad fija":
        v = comp.get("cantidad_fija") or comp.get("valor")
        return {
            "type":  "fixedQuantity",
            "value": v,
            "unit":  "EA"
        }

    if tipo == "Factor (alto)":
        v = comp.get("factor_multiplicador") or comp.get("valor")
        return {
            "type":    "heightMultiplier",
            "value":   v,
            "unit":    "m",
            "basedOn": "height"
        }

    # Fallback — should never happen on clean data
    return {
        "type":  "unknown",
        "value": comp.get("valor"),
        "unit":  comp.get("unidad", "EA")
    }

# ─────────────────────────────────────────────
# 3. Helpers — operative flags from notes text
# ─────────────────────────────────────────────
OPTIONAL_PATTERNS    = [r"opcional", r"queda a elecci[oó]n"]
RECOMMENDED_PATTERNS = [r"primera opci[oó]n", r"debe de ser la primera"]

def extract_flags(notes_text: str) -> dict:
    flags = {}
    text_lower = notes_text.lower()

    is_optional = any(re.search(p, text_lower) for p in OPTIONAL_PATTERNS)
    if is_optional:
        flags["optional"] = True

    is_recommended = any(re.search(p, text_lower) for p in RECOMMENDED_PATTERNS)
    if is_recommended:
        flags["recommended"] = True
        flags["priority"]    = 1

    return flags

# ─────────────────────────────────────────────
# 4. Transform a single component
# ─────────────────────────────────────────────
OLD_CALC_KEYS = {
    "tipo_calculo", "unidad",
    "valor_descuento_mm", "cantidad_fija", "factor_multiplicador",
    "valor",         # legacy from original file
    "reglas"
}

def transform_component(comp: dict) -> dict:
    notes_text = comp.get("reglas", "")
    flags      = extract_flags(notes_text)

    result = {
        "componentType": comp["componente_tipo"],
        "baseSku":       comp["sku_base"],
        "colorKey":      comp.get("color_key"),
        "calculation":   build_calculation(comp),
        "notes":         notes_text,
        **flags   # optional, recommended, priority — only present when truthy
    }
    return result

# ─────────────────────────────────────────────
# 5. Transform a single rule block
# ─────────────────────────────────────────────
def transform_rule(rule: dict) -> dict:
    return {
        "category":   rule["categoria"],
        "minWidthM":  rule["rango_min_m"],
        "maxWidthM":  rule["rango_max_m"],
        "components": [transform_component(c) for c in rule["componentes"]]
    }

# ─────────────────────────────────────────────
# 6. Build transformed rules list
# ─────────────────────────────────────────────
transformed_rules = [transform_rule(r) for r in raw_rules]

# ─────────────────────────────────────────────
# 7. Collect all distinct colorKey values
#    to build the colorMaps skeleton
# ─────────────────────────────────────────────
color_keys_found = set()
for rule in transformed_rules:
    for comp in rule["components"]:
        if comp["colorKey"]:
            color_keys_found.add(comp["colorKey"])

color_maps = {key: {} for key in sorted(color_keys_found)}

# ─────────────────────────────────────────────
# 8. Assemble final document
# ─────────────────────────────────────────────
output = {
    "version":   "1.0.0",
    "system":    "rollerBomRules",
    "rules":     transformed_rules,
    "colorMaps": color_maps
}

# ─────────────────────────────────────────────
# 9. Write output
# ─────────────────────────────────────────────
out_path = "docs/roller-bom-rules-v2.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print("Written ->", out_path)

# ─────────────────────────────────────────────
# 10. Self-validation
# ─────────────────────────────────────────────
FORBIDDEN_KEYS = {
    "tipo_calculo", "unidad", "valor_descuento_mm",
    "cantidad_fija", "factor_multiplicador", "valor",
    "categoria", "rango_min_m", "rango_max_m",
    "componentes", "componente_tipo", "sku_base",
    "color_key", "reglas"
}

def walk(obj, path=""):
    errors = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in FORBIDDEN_KEYS:
                errors.append("Forbidden key '%s' at %s" % (k, path))
            errors.extend(walk(v, path + "." + k))
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            errors.extend(walk(item, path + "[%d]" % i))
    return errors

errors = walk(output)

# Check every component has a calculation object
for ri, rule in enumerate(output["rules"]):
    for ci, comp in enumerate(rule["components"]):
        if "calculation" not in comp:
            errors.append("Missing calculation at rules[%d].components[%d]" % (ri, ci))
        if "colorKey" not in comp:
            errors.append("Missing colorKey at rules[%d].components[%d]" % (ri, ci))

# Check no snake_case keys remain (simple heuristic)
raw_out = json.dumps(output)
snake_matches = re.findall(r'"[a-z]+_[a-z_]+"', raw_out)
if snake_matches:
    errors.append("Possible snake_case keys remaining: %s" % list(set(snake_matches))[:5])

if errors:
    print("\nVALIDATION ERRORS:")
    for e in errors:
        print("  ERROR:", e)
else:
    print("VALIDATION OK — no forbidden keys, no snake_case, all components have calculation")

# Summary
print("\nSummary:")
print("  Total rule blocks : %d" % len(output["rules"]))
print("  Color maps found  : %s" % list(color_maps.keys()))
total_comps = sum(len(r["components"]) for r in output["rules"])
print("  Total components  : %d" % total_comps)

# Preview first component
first = output["rules"][0]["components"][0]
print("\nSample component (rules[0].components[0]):")
print(json.dumps(first, indent=4, ensure_ascii=False))
