import json

with open('docs/roller-bom-rules-v2.json', encoding='utf-8') as f:
    doc = json.load(f)

# Add 'grey' as alias pointing to the same SKU as 'gray'
# This allows the existing app (which uses 'grey') to resolve correctly
for key, cmap in doc['colorMaps'].items():
    if 'gray' in cmap and 'grey' not in cmap:
        cmap['grey'] = cmap['gray']

with open('docs/roller-bom-rules-v2.json', 'w', encoding='utf-8') as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)

total = sum(len(v) for v in doc['colorMaps'].values())
print(f'colorMaps updated. Total entries: {total}')
for k, v in doc['colorMaps'].items():
    print(f'  {k}: {sorted(v.keys())}')
