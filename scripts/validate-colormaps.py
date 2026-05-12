import json, re

with open('docs/roller-bom-rules-v2.json', encoding='utf-8') as f:
    doc = json.load(f)

COLOR_MAPS = doc['colorMaps']
SKU_PLACEHOLDER = re.compile(r'X+')

errors = []
resolutions = []

for rule in doc['rules']:
    for comp in rule['components']:
        sku  = comp['baseSku']
        ckey = comp.get('colorKey')
        if not ckey:
            continue
        cmap = COLOR_MAPS.get(ckey, {})
        for tone, suffix in cmap.items():
            resolved = SKU_PLACEHOLDER.sub(suffix, sku)
            if SKU_PLACEHOLDER.search(resolved):
                errors.append((rule['category'], comp['componentType'], tone, resolved))
            else:
                resolutions.append((comp['componentType'], sku, tone, suffix, resolved))

# Deduplicate
seen = set()
unique = []
for row in resolutions:
    key = (row[0], row[2])
    if key not in seen:
        seen.add(key)
        unique.append(row)

print(f'Total resoluciones OK: {len(resolutions)}')
print(f'Resoluciones unicas (comp x tone): {len(unique)}')
print()
print('Muestra de resoluciones:')
for ct, base, tone, suffix, res in sorted(unique, key=lambda x: (x[0], x[2])):
    print(f'  {ct:35s} [{tone:7s}] {base} -> {res}')

print()
if errors:
    print('ERRORES (X residual):')
    for e in errors:
        print(' ', e)
else:
    print('Sin errores de placeholder residual. Todos los X se resolvieron.')
