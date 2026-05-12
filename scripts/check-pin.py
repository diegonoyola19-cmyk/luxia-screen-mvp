import json
with open('docs/roller-bom-rules-v2.json', encoding='utf-8') as f:
    doc = json.load(f)
print('=== Roller Pin EndPlug rangos + End Plug ===')
for r in doc['rules']:
    if r['category'] == 'Roller Pin EndPlug':
        ep = [c for c in r['components'] if c['componentType'] == 'End Plug']
        print(f"  [{r['minWidthM']}-{r['maxWidthM']}] comps={len(r['components'])} EndPlug={[c['baseSku'] for c in ep]}")
