import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MaterialReviewModal } from '../MaterialReviewModal';
import { useCalculatorStore } from '../../store/useCalculatorStore';
import type { SavedOrder } from '../../../../domain/curtains/types';

vi.mock('../../../components/ui/Button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('../../../../domain/orders/issueStrategies', () => ({
  calculateIssueLines: vi.fn().mockReturnValue({
    issueLines: [],
    cutPlans: [],
    cutsFromRemainders: [],
    createdRemainders: []
  }),
}));

function makeOrderWith13Components(): SavedOrder {
  const hardwareItems = [
    { sku: '0-154-TU-38111', desc: 'Tubo de 38mm NEO', qty: 2.6, unit: 'm' },
    { sku: '0-151-AL-CLZ19', desc: 'Bottomrail', qty: 5.15, unit: 'm' },
    { sku: '0-154-PB-E04WH', desc: 'Soporte lado del control', qty: 3, unit: 'EA' },
    { sku: '0-154-PB-E05WH', desc: 'Soporte lado del extremo', qty: 3, unit: 'EA' },
    { sku: '0-154-CL-M16WH', desc: 'Control M16 White', qty: 3, unit: 'EA' },
    { sku: '0-154-EP-001WH', desc: 'End Plug 38mm', qty: 3, unit: 'EA' },
    { sku: '0-154-CH-006SS', desc: 'Cadena Acero Inox', qty: 6.0, unit: 'm' },
    { sku: '0-154-CS-001WH', desc: 'Conector Cadena', qty: 3, unit: 'EA' },
    { sku: '0-154-ST-001WH', desc: 'Tope Cadena', qty: 6, unit: 'EA' },
    { sku: '0-154-CW-001WH', desc: 'Contrapeso Cadena', qty: 3, unit: 'EA' },
    { sku: '0-151-TA-001WH', desc: 'Tapa Bottomrail', qty: 6, unit: 'EA' },
    { sku: '0-154-TP-001CL', desc: 'Cinta Doble Faz 12mm', qty: 5.2, unit: 'm' },
    { sku: '0-154-SP-001CL', desc: 'Spline PVC 9mm', qty: 5.2, unit: 'm' },
  ];

  return {
    id: 'ord-13-comp',
    orderNumber: 'ORD-827442',
    createdAt: new Date().toISOString(),
    status: 'in_production',
    sageExportedAt: null,
    items: [
      {
        id: 'curt-1',
        title: 'Cortina Principal',
        input: { widthMeters: 2.6, heightMeters: 2.0, hardwareTone: 'white', mountingSystem: 'standard' },
        result: {
          selectedFabric: { itemCode: '00027093118', description: 'Screen White 5%', color: 'White' },
          recommendedRollWidthMeters: 2.5,
          cutLengthMeters: 2.2,
          fabricDownloadedYd2: 5.85,
          wastePercentage: 8
        },
        materialLines: hardwareItems.map((h, i) => ({
          id: `mat-${i}`,
          itemCode: h.sku,
          sageItemCode: h.sku,
          description: h.desc,
          quantity: h.qty,
          unit: h.unit,
          category: 'hardware'
        }))
      }
    ]
  } as unknown as SavedOrder;
}

describe('MaterialReviewModal — Compact Worklist UX & Review Progress', () => {
  beforeEach(() => {
    useCalculatorStore.setState({
      savedOrders: [],
      remainders: [],
    });
    vi.clearAllMocks();
  });

  it('renders all 13 components in the compact table layout with column headers', () => {
    const order = makeOrderWith13Components();
    render(<MaterialReviewModal order={order} onClose={vi.fn()} />);

    // Sticky Table Header columns
    expect(screen.getByText('MATERIAL / SKU')).toBeInTheDocument();
    expect(screen.getByText('CALCULADO')).toBeInTheDocument();
    expect(screen.getByText('REVISIÓN')).toBeInTheDocument();
    expect(screen.getByText('DETALLE / AJUSTE')).toBeInTheDocument();
    expect(screen.getByText('ESTADO')).toBeInTheDocument();

    // Verify key materials are rendered in the table
    expect(screen.getByText('Tubo de 38mm NEO')).toBeInTheDocument();
    expect(screen.getByText('0-154-TU-38111')).toBeInTheDocument();
    expect(screen.getByText('Bottomrail')).toBeInTheDocument();
    expect(screen.getByText('Spline PVC 9mm')).toBeInTheDocument();
  });

  it('calculates and displays initial review progress (13 de 13 revisados, 100%)', () => {
    const order = makeOrderWith13Components();
    render(<MaterialReviewModal order={order} onClose={vi.fn()} />);

    expect(screen.getByText(/Revisados/i)).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('updates progress and displays "⚠ Revisar" when an item action is changed to incomplete', () => {
    const order = makeOrderWith13Components();
    render(<MaterialReviewModal order={order} onClose={vi.fn()} />);

    // Change first component action to "substituted" (which initially lacks actualSku and reason)
    const selects = screen.getAllByRole('combobox');
    const firstActionSelect = selects[0];
    fireEvent.change(firstActionSelect, { target: { value: 'substituted' } });

    // Progress should now be 12 de 13 (92%)
    expect(screen.getByText('92%')).toBeInTheDocument();

    // Warning badge on the incomplete row
    expect(screen.getByText('⚠ Revisar')).toBeInTheDocument();

    // Footer helper message
    expect(screen.getByText(/1 material con datos pendientes/i)).toBeInTheDocument();
  });

  it('restores 100% progress when "Confirmar todo sin cambios" is clicked', () => {
    const order = makeOrderWith13Components();
    render(<MaterialReviewModal order={order} onClose={vi.fn()} />);

    // Change first item to substituted
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'substituted' } });

    expect(screen.getByText('92%')).toBeInTheDocument();

    // Click "Confirmar todo sin cambios"
    const confirmAllBtn = screen.getByRole('button', { name: /Confirmar todo sin cambios/i });
    fireEvent.click(confirmAllBtn);

    // Progress restores to 100% and all badges become ✓ Igual
    expect(screen.getByText('100%')).toBeInTheDocument();
    const igualBadges = screen.getAllByText('✓ Igual');
    expect(igualBadges.length).toBe(13);
  });

  it('renders fabrics tab with compact worklist and progress indicator', () => {
    const order = makeOrderWith13Components();
    render(<MaterialReviewModal order={order} onClose={vi.fn()} />);

    // Switch to Fabrics tab
    const fabricsTab = screen.getByRole('button', { name: /Telas \/ Paños/i });
    fireEvent.click(fabricsTab);

    // Fabrics table header
    expect(screen.getByText('CORTINA / TELA')).toBeInTheDocument();
    expect(screen.getByText('MEDIDAS / ORIGEN')).toBeInTheDocument();
    expect(screen.getByText('DETALLE SAGE')).toBeInTheDocument();

    // Fabric item row
    expect(screen.getByText('Cortina Principal')).toBeInTheDocument();
    expect(screen.getByText('00027093118')).toBeInTheDocument();
    expect(screen.getByText('2.6 x 2m')).toBeInTheDocument();
    expect(screen.getByText('Rollo 2.5m')).toBeInTheDocument();
    expect(screen.getAllByText(/5.85/).length).toBeGreaterThanOrEqual(1);

    // Fabrics progress
    expect(screen.getByText(/Revisadas/i)).toBeInTheDocument();
  });
});
