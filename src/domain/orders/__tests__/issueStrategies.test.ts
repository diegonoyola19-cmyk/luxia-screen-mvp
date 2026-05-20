import { describe, it, expect } from 'vitest';
import { calculateIssueLines, IssueEngineInputLine, ReusableRemainder, determineIssueMode } from '../issueStrategies';

describe('Issue Strategies - Catalog Based Engine', () => {
  it('1. Tapaderas de bottomrail (0-151-RE-10500) -> EA / exact_each', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: '0-151-RE-10500', description: 'Tapaderas de bottomrail', quantity: 14, unit: 'EA' }
    ];
    const result = calculateIssueLines(lines, []);
    expect(result.sageLines).toHaveLength(1);
    expect(result.sageLines[0].itemCode).toBe('0-151-RE-10500');
    expect(result.sageLines[0].quantity).toBe(14); // Exactamente 14 EA, sin cut plan
    expect(result.cutPlans).toHaveLength(0);
  });

  it('2. Adaptador 50mm (0-154-AD-RA250) -> EA / exact_each', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: '0-154-AD-RA250', description: 'Adaptador 50mm', quantity: 4, unit: 'EA' }
    ];
    const result = calculateIssueLines(lines, []);
    expect(result.sageLines).toHaveLength(1);
    expect(result.sageLines[0].itemCode).toBe('0-154-AD-RA250');
    expect(result.sageLines[0].quantity).toBe(4); // Exactamente 4 EA, sin cut plan
  });

  it('3. Bottomrail real (0-151-AL-CLZ19) -> FT / full_piece_with_remainders', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: '0-151-AL-CLZ19', description: 'Bottomrail', quantity: 9.61, unit: 'FT' },
      { sku: '0-151-AL-CLZ19', description: 'Bottomrail', quantity: 9.48, unit: 'FT' },
      { sku: '0-151-AL-CLZ19', description: 'Bottomrail', quantity: 4.98, unit: 'FT' },
      { sku: '0-151-AL-CLZ19', description: 'Bottomrail', quantity: 5.15, unit: 'FT' },
      { sku: '0-151-AL-CLZ19', description: 'Bottomrail', quantity: 5.15, unit: 'FT' },
      { sku: '0-151-AL-CLZ19', description: 'Bottomrail', quantity: 4.72, unit: 'FT' },
      { sku: '0-151-AL-CLZ19', description: 'Bottomrail', quantity: 4.82, unit: 'FT' }
    ];
    const result = calculateIssueLines(lines, []);
    expect(result.sageLines[0].itemCode).toBe('0-151-AL-CLZ19');
    expect(result.sageLines[0].quantity).toBe(57); // 3 barras de 19 FT
    expect(result.cutPlans[0].bars).toHaveLength(3);
  });

  it('4. Tubo real (0-154-TU-50001, 0-154-TU-38111) -> FT / full_piece_with_remainders', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: '0-154-TU-50001', description: 'Tubo 50 mm', quantity: 10, unit: 'FT' },
      { sku: '0-154-TU-50001', description: 'Tubo 50 mm', quantity: 9.09, unit: 'FT' }
    ];
    const result = calculateIssueLines(lines, []);
    expect(result.sageLines[0].itemCode).toBe('0-154-TU-50001');
    expect(result.sageLines[0].quantity).toBe(38); // 2 barras
  });

  it('5. Tela -> Y2 / exact_area', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: '0-004-87-02518', description: 'Tela Screen', quantity: 17.5104, unit: 'Y2' }
    ];
    const result = calculateIssueLines(lines, []);
    expect(result.sageLines[0].itemCode).toBe('0-004-87-02518');
    expect(result.sageLines[0].quantity).toBe(17.5104);
    expect(result.cutPlans).toHaveLength(0);
  });

  it('6. Cadena respetando catálogo', () => {
    expect(determineIssueMode('0-151-CH-012H0', 'FT')).toBe('exact_linear');
    // Para collectIssueEngineInputs se prueba en test e2e, pero aquí aseguramos el modo
  });

  it('7. SKU sin catálogo que usa fallback conservador y NO usa full_piece_with_remainders', () => {
    // Falso positivo: "tubo de cartón" que se usa para empaque, debería ser EA, no full_piece_with_remainders
    expect(determineIssueMode('SKU-UNKN-TUBO', 'EA')).toBe('exact_each');
    expect(determineIssueMode('SKU-UNKN-BOTTOMRAIL', 'FT')).toBe('exact_linear');
    expect(determineIssueMode('SKU-UNKN-TELA', 'Y2')).toBe('exact_area');
  });

  it('ORD-0225: Full Export Test', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: '0-154-TU-50001', description: 'Tubo 50 mm', quantity: 10, unit: 'FT' },
      { sku: '0-154-TU-50001', description: 'Tubo 50 mm', quantity: 9.09, unit: 'FT' },
      { sku: '0-151-AL-CLZ19', description: 'Bottomrail', quantity: 9.61, unit: 'FT' },
      { sku: '0-151-AL-CLZ19', description: 'Bottomrail', quantity: 9.48, unit: 'FT' },
      { sku: '0-151-AL-CLZ19', description: 'Bottomrail', quantity: 4.98, unit: 'FT' },
      { sku: '0-151-AL-CLZ19', description: 'Bottomrail', quantity: 5.15, unit: 'FT' },
      { sku: '0-151-AL-CLZ19', description: 'Bottomrail', quantity: 5.15, unit: 'FT' },
      { sku: '0-151-AL-CLZ19', description: 'Bottomrail', quantity: 4.72, unit: 'FT' },
      { sku: '0-151-AL-CLZ19', description: 'Bottomrail', quantity: 4.82, unit: 'FT' },
      { sku: '0-154-TU-38111', description: 'Tubo NEO 38 mm', quantity: 12.42, unit: 'FT' },
      { sku: '0-154-TU-38111', description: 'Tubo NEO 38 mm', quantity: 12.42, unit: 'FT' },
      { sku: '0-151-RE-10500', description: 'Tapaderas', quantity: 14, unit: 'EA' },
      { sku: '0-154-AD-RA250', description: 'Adaptador', quantity: 4, unit: 'EA' },
      { sku: '0-004-87-02518', description: 'Tela', quantity: 17.5104, unit: 'Y2' },
      { sku: '0-004-87-02598', description: 'Tela 2', quantity: 23.25, unit: 'Y2' }
    ];

    const result = calculateIssueLines(lines, []);
    
    const sageMap = new Map(result.sageLines.map(l => [l.itemCode, l.quantity]));
    
    expect(sageMap.get('0-154-TU-50001')).toBe(38);
    expect(sageMap.get('0-151-AL-CLZ19')).toBe(57);
    expect(sageMap.get('0-154-TU-38111')).toBe(38);
    expect(sageMap.get('0-151-RE-10500')).toBe(14);
    expect(sageMap.get('0-154-AD-RA250')).toBe(4);
    expect(sageMap.get('0-004-87-02518')).toBe(17.5104);
    expect(sageMap.get('0-004-87-02598')).toBe(23.25);
  });

  it('8. calculateIssueLines devuelve createdRemainders y previene duplicados (actualiza si existe)', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: '0-154-TU-50001', description: 'Tubo 50 mm', quantity: 10, unit: 'FT', orderId: 'test-order' },
    ];
    
    // First run
    const result1 = calculateIssueLines(lines, []);
    expect(result1.updatedRemainders).toHaveLength(1);
    const r1 = result1.updatedRemainders[0];
    expect(r1.status).toBe('available');
    expect(r1.remainingLengthFt).toBe(9); // 19 - 10
    expect(r1.createdFromOrderId).toBe('test-order');

    // Second run with identical input, but providing the previously generated remainder
    // The engine should NOT duplicate it, it should update it in place.
    const result2 = calculateIssueLines(lines, result1.updatedRemainders);
    expect(result2.updatedRemainders).toHaveLength(1);
    const r2 = result2.updatedRemainders[0];
    expect(r2.id).toBe(r1.id); // Same stable ID
    expect(r2.remainingLengthFt).toBe(9);
  });
});
