/**
 * ProduccionV3.tsx — Dashboard definitivo Roller
 * Motor: rollerEngineV3.ts | Telas: v3-fabrics.json
 */
import { useState, useMemo, useCallback } from 'react';
import {
  resolveHardwareRecipeFromBOM, calcFabricCut, getFabricLine, calcTotalCost,
  ALL_FABRICS, type Tone, type RecipeLine, type FabricItem, type FabricCut,
} from '../../../logic/rollerEngineV3';
import { formatNumber } from '../../../lib/format';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CurtainEntry {
  id: string;
  width: number;
  height: number;
  tone: Tone;
  isMotorized: boolean;
  fabricSku: string;
  notes: string;
}

// ─── Stock Badge ──────────────────────────────────────────────────────────────
function Badge({ line }: { line: RecipeLine }) {
  if (line.qtyOH === -1) return <Chip c="#6b7280" t="Corte" />;
  if (line.status === 'ok') return <Chip c="#4ade80" t={`✅ ${line.qtyOH}`} />;
  if (line.status === 'alt') return <Chip c="#f59e0b" t="⚠ Alternativa" />;
  return <Chip c="#ef4444" t="❌ Sin stock" />;
}
function Chip({ c, t }: { c: string; t: string }) {
  return <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, color: c, background: c + '18', border: `1px solid ${c}40`, whiteSpace: 'nowrap' }}>{t}</span>;
}

// ─── Cut Diagram SVG ──────────────────────────────────────────────────────────
function CutSVG({ cut, width, height }: { cut: FabricCut | null; width: number; height: number }) {
  const W = 460, H = 200, P = 36;
  const rollW = cut?.fabric.crossW ?? 1.3;
  const cutW  = width + 0.02;
  const scale = Math.min((W - P * 2) / rollW, 1);
  const rollPx = (W - P * 2);
  const cutPx  = Math.min(cutW / rollW, 1) * rollPx;
  const wastePx = rollPx - cutPx;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <pattern id="fp" width="6" height="6" patternUnits="userSpaceOnUse">
          <line x1="0" y1="6" x2="6" y2="0" stroke="rgba(148,163,184,0.1)" strokeWidth="1" />
        </pattern>
      </defs>
      {/* Roll background */}
      <rect x={P} y={40} width={rollPx} height={120} fill="#1f2937" rx="2" stroke="#374151" />
      {/* Fabric cut area */}
      <rect x={P} y={40} width={cutPx} height={120} fill="url(#fp)" stroke="#6366f1" strokeWidth="1.5" />
      {/* Waste area */}
      {wastePx > 0 && <rect x={P + cutPx} y={40} width={wastePx} height={120} fill="rgba(239,68,68,0.08)" stroke="#ef444440" strokeWidth="1" strokeDasharray="4 3" />}
      {/* Labels */}
      <text x={P + cutPx / 2} y={104} fill="#a5b4fc" fontSize="11" textAnchor="middle" fontWeight="600">{cutW.toFixed(2)}m × {(height + 0.20).toFixed(2)}m</text>
      <text x={P + cutPx / 2} y={118} fill="#6b7280" fontSize="9" textAnchor="middle">Corte (incl. merma)</text>
      {wastePx > 6 && cut && <text x={P + cutPx + wastePx / 2} y={104} fill="#ef4444" fontSize="9" textAnchor="middle">Merma {cut.wasteWidth.toFixed(2)}m</text>}
      {/* Roll width */}
      <text x={W / 2} y={20} fill="#9ca3af" fontSize="10" textAnchor="middle">Ancho rollo: {rollW.toFixed(3)}m</text>
      {/* Tube line */}
      <rect x={P} y={40} width={cutPx} height={7} fill="url(#v3tube2)" rx="1" />
      <defs><linearGradient id="v3tube2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d1d5db" /><stop offset="100%" stopColor="#9ca3af" /></linearGradient></defs>
      <text x={P + cutPx / 2} y={50} fill="#111827" fontSize="8" textAnchor="middle">+15cm tubo</text>
      {/* Pocket */}
      <rect x={P} y={153} width={cutPx} height={7} fill="rgba(99,102,241,0.2)" />
      <text x={P + cutPx / 2} y={161} fill="#818cf8" fontSize="8" textAnchor="middle">+5cm bolsillo</text>
    </svg>
  );
}

// ─── Fabric Selector ──────────────────────────────────────────────────────────
function FabricSelector({ value, onChange }: { value: string; onChange: (sku: string) => void }) {
  const [q, setQ] = useState('');
  const opts = useMemo(() => {
    const lower = q.toLowerCase();
    return ALL_FABRICS.filter(f => !q || f.desc.toLowerCase().includes(lower) || f.sku.toLowerCase().includes(lower)).slice(0, 60);
  }, [q]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input placeholder="Buscar tela..." value={q} onChange={e => setQ(e.target.value)}
        style={{ ...inp, fontSize: '0.75rem', marginBottom: 4 }} />
      <select value={value} onChange={e => onChange(e.target.value)} size={5}
        style={{ ...inp, height: 120, fontSize: '0.72rem', padding: '4px' }}>
        {opts.map(f => (
          <option key={f.sku} value={f.sku}>
            [{f.qtyOH > 0 ? '✅' : '❌'}] {f.desc.slice(0, 48)} — ${f.cost.toFixed(2)}/SQYD
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── BOM Table ────────────────────────────────────────────────────────────────
function BOMTable({ lines, totalCost }: { lines: RecipeLine[]; totalCost: number }) {
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: '#f9fafb' }}>Bill of Materials</h3>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{lines.length} ítems</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
        <thead>
          <tr style={{ background: '#0f172a' }}>
            {['Rol', 'SKU / Componente', 'Uso', 'Costo', 'Stock'].map(h => (
              <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} style={{ borderTop: '1px solid #1f2937', background: l.status === 'out' && l.qtyOH !== -1 ? 'rgba(239,68,68,0.04)' : l.status === 'alt' ? 'rgba(245,158,11,0.04)' : 'transparent' }}>
              <td style={{ padding: '0.6rem 0.75rem', color: '#9ca3af', fontWeight: 500, whiteSpace: 'nowrap' }}>{l.role}</td>
              <td style={{ padding: '0.6rem 0.75rem' }}>
                <div style={{ fontWeight: 600, color: '#f9fafb', fontSize: '0.72rem' }}>{l.sku}</div>
                <div style={{ fontSize: '0.65rem', color: '#6b7280' }}>{l.desc.slice(0, 55)}</div>
                {l.altNote && <div style={{ fontSize: '0.62rem', color: '#f59e0b' }}>↳ {l.altNote}</div>}
              </td>
              <td style={{ padding: '0.6rem 0.75rem', color: '#d1d5db', whiteSpace: 'nowrap' }}>{formatNumber(l.qty, 2)} {l.unit}</td>
              <td style={{ padding: '0.6rem 0.75rem', color: '#d1d5db', whiteSpace: 'nowrap', fontWeight: 600 }}>
                {l.qtyOH === -1 ? '—' : `$${formatNumber(l.totalCost, 2)}`}
              </td>
              <td style={{ padding: '0.6rem 0.75rem' }}><Badge line={l} /></td>
            </tr>
          ))}
          <tr style={{ background: '#0f172a', borderTop: '2px solid #374151' }}>
            <td colSpan={3} style={{ padding: '0.65rem 0.75rem', color: '#9ca3af', fontSize: '0.7rem', fontWeight: 700 }}>TOTAL FABRICACIÓN</td>
            <td style={{ padding: '0.65rem 0.75rem', fontWeight: 800, fontSize: '1rem', color: '#f9fafb' }}>${formatNumber(totalCost, 2)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
const newCurtain = (): CurtainEntry => ({
  id: Math.random().toString(36).slice(2),
  width: 1.35, height: 1.20, tone: 'white',
  isMotorized: false, fabricSku: ALL_FABRICS[0]?.sku ?? '', notes: '',
});

export function ProduccionV3() {
  const [projectName, setProjectName]   = useState('');
  const [projectNotes, setProjectNotes] = useState('');
  const [curtains, setCurtains]         = useState<CurtainEntry[]>([newCurtain()]);
  const [activeIdx, setActiveIdx]       = useState(0);
  const [sageMarked, setSageMarked]     = useState(false);
  const [copied, setCopied]             = useState(false);

  const active = curtains[activeIdx] ?? curtains[0];

  const updateActive = useCallback((patch: Partial<CurtainEntry>) => {
    setCurtains(prev => prev.map((c, i) => i === activeIdx ? { ...c, ...patch } : c));
  }, [activeIdx]);

  const addCurtain = () => {
    setCurtains(prev => [...prev, newCurtain()]);
    setActiveIdx(curtains.length);
  };

  const removeCurtain = (idx: number) => {
    if (curtains.length === 1) return;
    setCurtains(prev => prev.filter((_, i) => i !== idx));
    setActiveIdx(Math.max(0, activeIdx - 1));
  };

  // BOM para la cortina activa
  const hwLines  = useMemo(() => {
    try {
      return resolveHardwareRecipeFromBOM(active.width, active.height, active.tone, active.isMotorized);
    } catch {
      return [];
    }
  }, [active.width, active.height, active.tone, active.isMotorized]);
  const fabric   = useMemo(() => ALL_FABRICS.find(f => f.sku === active.fabricSku) ?? null, [active.fabricSku]);
  const cut      = useMemo(() => fabric ? calcFabricCut(fabric, active.width, active.height) : null, [fabric, active.width, active.height]);
  const fabLine  = useMemo(() => cut ? getFabricLine(cut) : null, [cut]);
  const allLines = useMemo(() => fabLine ? [...hwLines, fabLine] : hwLines, [hwLines, fabLine]);
  const activeCost = useMemo(() => calcTotalCost(allLines), [allLines]);

  // Costo acumulado de todas las cortinas
  const totalOrderCost = useMemo(() => {
    return curtains.reduce((sum, c) => {
      let hw: RecipeLine[] = [];
      try { hw = resolveHardwareRecipeFromBOM(c.width, c.height, c.tone, c.isMotorized); } catch { /**/ }
      const f  = ALL_FABRICS.find(f => f.sku === c.fabricSku);
      const ct = f ? calcFabricCut(f, c.width, c.height) : null;
      const fl = ct ? getFabricLine(ct) : null;
      return sum + calcTotalCost(fl ? [...hw, fl] : hw);
    }, 0);
  }, [curtains]);

  const hasIssues = allLines.some(l => l.status !== 'ok' && l.qtyOH !== -1);
  const hasCritical = allLines.some(l => l.status === 'out' && l.qtyOH !== -1) || (cut && !cut.feasible);

  // Copy summary
  const copySummary = async () => {
    const lines = curtains.map((c, i) => {
      const f = ALL_FABRICS.find(f => f.sku === c.fabricSku);
      return `Cortina ${i + 1}: ${c.width.toFixed(2)}m × ${c.height.toFixed(2)}m | ${f?.desc ?? 'Sin tela'} | ${c.isMotorized ? 'Motorizada' : 'Manual'} | Tono: ${c.tone}`;
    }).join('\n');
    const text = `PROYECTO: ${projectName || 'Sin nombre'}\n${new Date().toLocaleDateString()}\n\n${lines}\n\nCOSTO TOTAL: $${formatNumber(totalOrderCost, 2)}\n\nNotas: ${projectNotes || '—'}\n\n${sageMarked ? '✅ Pasado a Sage' : '⏳ Pendiente Sage'}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Alerta de factibilidad de tela
  const fabricAlert = cut && !cut.feasible ? cut.feasibleNote : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gridTemplateRows: 'auto 1fr', gap: '1rem', padding: '1rem', background: '#0c0c0e', minHeight: '100vh', fontFamily: "'Inter', sans-serif", color: '#e5e7eb', boxSizing: 'border-box' }}>

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.6rem', color: '#6366f1', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Producción V3 · Lab</p>
          <input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Nombre del Proyecto..."
            style={{ background: 'transparent', border: 'none', color: '#f9fafb', fontSize: '1.1rem', fontWeight: 700, outline: 'none', padding: 0, width: 300 }} />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Total orden:</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f9fafb' }}>${formatNumber(totalOrderCost, 2)}</span>
          <button onClick={() => setSageMarked(p => !p)}
            style={{ ...btn, background: sageMarked ? '#052e16' : '#1f2937', color: sageMarked ? '#4ade80' : '#9ca3af', border: `1px solid ${sageMarked ? '#4ade8040' : '#374151'}` }}>
            {sageMarked ? '✅ Sage' : '◻ Marcar Sage'}
          </button>
          <button onClick={copySummary}
            style={{ ...btn, background: '#1e1b4b', color: '#a5b4fc', border: '1px solid #3730a3' }}>
            {copied ? '✅ Copiado' : '📋 Copiar resumen'}
          </button>
        </div>
      </div>

      {/* ── LEFT PANEL ────────────────────────────────────────────────────── */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', maxHeight: 'calc(100vh - 80px)' }}>

        {/* Cortinas tabs */}
        <div style={{ ...card, padding: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            {curtains.map((c, i) => (
              <button key={c.id} onClick={() => setActiveIdx(i)}
                style={{ ...btn, background: i === activeIdx ? '#1e1b4b' : '#1f2937', color: i === activeIdx ? '#a5b4fc' : '#9ca3af', border: `1px solid ${i === activeIdx ? '#3730a3' : '#374151'}`, fontSize: '0.7rem' }}>
                #{i + 1} {c.width.toFixed(2)}m
                {curtains.length > 1 && <span onClick={e => { e.stopPropagation(); removeCurtain(i); }} style={{ marginLeft: 4, color: '#ef4444', cursor: 'pointer' }}>×</span>}
              </button>
            ))}
            <button onClick={addCurtain} style={{ ...btn, background: '#052e16', color: '#4ade80', border: '1px solid #4ade8040', fontSize: '0.7rem' }}>+ Cortina</button>
          </div>

          {/* Dimensions */}
          <label style={lbl}>Ancho (m)</label>
          <input type="number" step="0.01" value={active.width}
            onChange={e => updateActive({ width: Number(e.target.value) })} style={inp} />
          <label style={{ ...lbl, marginTop: 8 }}>Alto (m)</label>
          <input type="number" step="0.01" value={active.height}
            onChange={e => updateActive({ height: Number(e.target.value) })} style={inp} />
          <label style={{ ...lbl, marginTop: 8 }}>Tono Herrajes</label>
          <select value={active.tone} onChange={e => updateActive({ tone: e.target.value as Tone })} style={inp}>
            <option value="white">White</option>
            <option value="ivory">Ivory / Satin</option>
            <option value="grey">Grey</option>
            <option value="bronze">Bronze</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}>
            <input type="checkbox" checked={active.isMotorized}
              onChange={e => updateActive({ isMotorized: e.target.checked })}
              style={{ width: 15, height: 15, accentColor: '#6366f1' }} />
            Motorizada
          </label>
          <label style={{ ...lbl, marginTop: 10 }}>Notas de esta cortina</label>
          <textarea value={active.notes} onChange={e => updateActive({ notes: e.target.value })}
            rows={2} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit', fontSize: '0.75rem' }} />
        </div>

        {/* Fabric selector */}
        <div style={{ ...card, padding: '0.75rem' }}>
          <label style={{ ...lbl, marginBottom: 6 }}>Tela</label>
          <FabricSelector value={active.fabricSku} onChange={sku => updateActive({ fabricSku: sku })} />
          {fabric && (
            <div style={{ marginTop: 8, fontSize: '0.68rem', color: '#9ca3af', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Rollo: <b style={{ color: '#f9fafb' }}>{fabric.crossW.toFixed(3)}m</b> ancho</span>
              <span>Stock: <b style={{ color: fabric.qtyOH > 0 ? '#4ade80' : '#ef4444' }}>{fabric.qtyOH} SQYD</b></span>
              <span>Costo: <b style={{ color: '#f9fafb' }}>${fabric.cost.toFixed(2)}/SQYD</b></span>
              {cut && <span>Corte: <b style={{ color: '#a5b4fc' }}>{cut.cutAreaSqYd.toFixed(2)} SQYD</b> → <b style={{ color: '#f9fafb' }}>${cut.fabricCost.toFixed(2)}</b></span>}
              {cut && cut.wasteWidth > 0 && <span style={{ color: '#f59e0b' }}>Merma: {cut.wasteWidth.toFixed(2)}m ancho</span>}
            </div>
          )}
          {fabricAlert && <div style={{ marginTop: 8, background: '#2d0a0a', border: '1px solid #ef444440', borderRadius: 6, padding: '0.5rem', fontSize: '0.7rem', color: '#ef4444' }}>{fabricAlert}</div>}
        </div>

        {/* Project notes */}
        <div style={{ ...card, padding: '0.75rem' }}>
          <label style={lbl}>Notas del Proyecto</label>
          <textarea value={projectNotes} onChange={e => setProjectNotes(e.target.value)}
            rows={3} placeholder="Instrucciones especiales, colores, instalación..."
            style={{ ...inp, resize: 'vertical', fontFamily: 'inherit', fontSize: '0.75rem' }} />
        </div>

        {/* Regla activa */}
        <div style={{ background: '#1e1b4b30', border: '1px solid #3730a340', borderRadius: 8, padding: '0.65rem 0.75rem', fontSize: '0.7rem', color: '#a5b4fc' }}>
          <b>Regla activa:</b>{' '}
          {active.width <= 1.80 ? 'Roller 0–1.80m · T38mm + VTX 20' : active.width <= 2.20 ? 'T38mm + VTX 20' : active.width <= 2.70 ? 'T45mm + VTX 30' : 'T63mm Heavy Duty'}
          {active.isMotorized && ' + Motor Celtic'}
        </div>
      </aside>

      {/* ── RIGHT PANEL ───────────────────────────────────────────────────── */}
      <main style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', maxHeight: 'calc(100vh - 80px)', minWidth: 0 }}>

        {/* Cost card */}
        <div style={{ ...card, display: 'flex', gap: '1.5rem', alignItems: 'center',
          background: hasCritical ? '#2d0a0a' : hasIssues ? '#1c1004' : '#052e16',
          border: `1px solid ${hasCritical ? '#ef444440' : hasIssues ? '#f59e0b40' : '#4ade8040'}` }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.65rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Costo esta cortina</p>
            <p style={{ margin: '2px 0 0 0', fontSize: '2rem', fontWeight: 800, color: '#f9fafb', lineHeight: 1 }}>${formatNumber(activeCost, 2)}</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', color: hasCritical ? '#ef4444' : hasIssues ? '#f59e0b' : '#4ade80' }}>
              {hasCritical ? '❌ Componentes sin stock — no fabricar' : hasIssues ? '⚠ Usando alternativas' : '✅ Todo disponible en bodega'}
            </p>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: '0.65rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total {curtains.length} cortina{curtains.length > 1 ? 's' : ''}</p>
            <p style={{ margin: '2px 0 0 0', fontSize: '1.5rem', fontWeight: 700, color: '#f9fafb' }}>${formatNumber(totalOrderCost, 2)}</p>
          </div>
        </div>

        {/* BOM */}
        <BOMTable lines={allLines} totalCost={activeCost} />

        {/* SVG Diagram */}
        <div style={{ ...card, padding: '0.75rem' }}>
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 600, color: '#f9fafb' }}>Esquema de Corte</h3>
          <div style={{ background: '#070709', borderRadius: 6, padding: '0.75rem', display: 'flex', justifyContent: 'center', border: '1px dashed #1f2937' }}>
            <CutSVG cut={cut} width={active.width} height={active.height} />
          </div>
          {cut && (
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.7rem', color: '#9ca3af' }}>
              <span>Corte ancho: <b style={{ color: '#a5b4fc' }}>{cut.cutWidth.toFixed(2)}m</b></span>
              <span>Corte alto: <b style={{ color: '#a5b4fc' }}>{cut.cutHeight.toFixed(2)}m</b></span>
              <span>Total: <b style={{ color: '#f9fafb' }}>{cut.cutAreaSqYd.toFixed(2)} SQYD</b></span>
              {cut.wasteWidth > 0 && <span>Merma: <b style={{ color: '#f59e0b' }}>{cut.wasteAreaSqYd.toFixed(2)} SQYD</b></span>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const card: React.CSSProperties = { background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '1rem' };
const lbl: React.CSSProperties = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#9ca3af', marginBottom: 4 };
const inp: React.CSSProperties = { width: '100%', background: '#0c0c0e', border: '1px solid #374151', color: '#f9fafb', padding: '0.4rem 0.6rem', borderRadius: 6, fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' };
const btn: React.CSSProperties = { padding: '0.35rem 0.65rem', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, border: 'none' };
