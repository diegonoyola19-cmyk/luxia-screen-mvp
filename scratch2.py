import os

f = 'src/features/calculadora-screen/components/RulesPanel.tsx'
with open(f, 'r', encoding='utf-8') as file:
    content = file.read()

new_ui = """              <div className="config-row__main">
                <strong>{component.label}</strong>
                {component.condition && component.condition !== 'always' ? (
                  <small style={{ color: '#0ea5e9' }}>
                    {component.condition === 'manual_only' && 'Solo manual'}
                    {component.condition === 'motorized_only' && 'Solo motor'}
                    {component.condition === 'large_tube_only' && 'Tubo grande'}
                  </small>
                ) : null}
              </div>"""

content = content.replace('              <div className="config-row__main">\n                <strong>{component.label}</strong>\n              </div>', new_ui)

with open(f, 'w', encoding='utf-8') as file:
    file.write(content)
