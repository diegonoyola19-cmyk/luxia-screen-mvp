"""
add-scope-to-bom.py
Luxia MES — agrega el campo `scope` a roller-bom-rules-v2.json.

Reglas:
  - "Roller Bracket Doble" → "Soporte lado del control" → scope: "group"
  - Todo lo demás                                        → scope: "curtain"
"""

import json, re

DOUBLE_BRACKET_CAT = "Roller Bracket Doble"

# Componentes que son compartidos por el conjunto (no por cada cortina)
GROUP_SCOPE_TYPES = {
    "Soporte lado del control",
}

with open("docs/roller-bom-rules-v2.json", encoding="utf-8") as f:
    doc = json.load(f)

patched = 0
for rule in doc["rules"]:
    for comp in rule["components"]:
        if (
            rule["category"] == DOUBLE_BRACKET_CAT
            and comp["componentType"] in GROUP_SCOPE_TYPES
        ):
            comp["scope"] = "group"
            patched += 1
        else:
            comp["scope"] = "curtain"

with open("docs/roller-bom-rules-v2.json", "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)

print("Patched %d group-scope components" % patched)

# Quick validation
errors = []
for rule in doc["rules"]:
    for comp in rule["components"]:
        if "scope" not in comp:
            errors.append("Missing scope: %s / %s" % (rule["category"], comp["componentType"]))
        if comp.get("scope") not in ("curtain", "group"):
            errors.append("Invalid scope value: %s" % comp.get("scope"))

if errors:
    for e in errors:
        print("ERROR:", e)
else:
    total = sum(len(r["components"]) for r in doc["rules"])
    group_comps = [(r["category"], c["componentType"])
                   for r in doc["rules"] for c in r["components"] if c["scope"] == "group"]
    print("Validation OK — %d total components, %d group-scoped:" % (total, len(group_comps)))
    for cat, ct in group_comps:
        print("  [group] %s / %s" % (cat, ct))
