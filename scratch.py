import os

f = 'src/features/calculadora-screen/components/ProductionModule.tsx'
with open(f, 'r', encoding='utf-8') as file:
    content = file.read()

new_field = """          <label className="field">
            <span>Accionamiento</span>
            <select
              value={store.formValues.driveType ?? 'manual'}
              onChange={(event) => store.setFormValue('driveType', event.target.value)}
            >
              <option value="manual">Manual (Cadena)</option>
              <option value="motorized">Motorizado</option>
            </select>
          </label>

          <label className="field">
            <span>Ancho (m)</span>"""

content = content.replace('          <label className="field">\n            <span>Ancho (m)</span>', new_field)

with open(f, 'w', encoding='utf-8') as file:
    file.write(content)
