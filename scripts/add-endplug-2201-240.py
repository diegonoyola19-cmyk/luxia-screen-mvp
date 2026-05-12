"""
add-endplug-2201-240.py
Agrega End Plug SLH53 al rango 2.201-2.40 de Roller Pin EndPlug.
Solo modifica ese rango específico; no toca otros rangos, SKUs ni cálculos.
"""
import json
import copy

PATH = 'docs/roller-bom-rules-v2.json'

with open(PATH, encoding='utf-8') as f:
    doc = json.load(f)

END_PLUG_COMPONENT = {
    "componentType": "End Plug",
    "baseSku": "0-155-EW-SLH53",
    "colorKey": None,
    "calculation": {
        "type": "fixedQuantity",
        "value": 1,
        "unit": "EA"
    },
    "scope": "curtain",
    "notes": "End Plug grande — aplica en rango 2.201-2.40 (confirmado por producción)",
    "optional": False,
    "recommended": False
}

modified = 0
for rule in doc['rules']:
    if (rule['category'] == 'Roller Pin EndPlug'
            and rule['minWidthM'] == 2.201
            and rule['maxWidthM'] == 2.4):
        # Verificar que no exista ya
        existing = [c for c in rule['components'] if c['componentType'] == 'End Plug']
        if existing:
            print(f"  SKIP: ya tiene End Plug en [{rule['minWidthM']}-{rule['maxWidthM']}]")
        else:
            rule['components'].append(copy.deepcopy(END_PLUG_COMPONENT))
            modified += 1
            print(f"  ADDED: End Plug SLH53 en [{rule['minWidthM']}-{rule['maxWidthM']}]")

if modified == 0:
    print("  WARN: No se encontró el rango 2.201-2.40 para Roller Pin EndPlug")
else:
    with open(PATH, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    print(f"\nJSON actualizado. {modified} rango(s) modificado(s).")

# Verificación final
print("\n=== Verificación final ===")
for rule in doc['rules']:
    if rule['category'] == 'Roller Pin EndPlug':
        eps = [c['baseSku'] for c in rule['components'] if c['componentType'] == 'End Plug']
        print(f"  [{rule['minWidthM']}-{rule['maxWidthM']}] EndPlug={eps}")
