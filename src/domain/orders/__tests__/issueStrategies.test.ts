import { describe, it, expect, vi } from 'vitest';
import { calculateIssueLines, IssueEngineInputLine, ReusableRemainder, generateId } from '../issueStrategies';

describe('Issue Strategies - Sage Export Engine', () => {
  it('Tubo requiere 5 FT sin sobrante -> Sage 19 FT, sobrante 14 FT', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: 'TUB-38', description: 'Tubo de 38mm', quantity: 5, unit: 'FT', orderId: 'O-1' }
    ];

    const result = calculateIssueLines(lines, []);

    // Debe pedir 19 FT a Sage
    expect(result.sageLines).toHaveLength(1);
    expect(result.sageLines[0].itemCode).toBe('TUB-38');
    expect(result.sageLines[0].quantity).toBe(19);

    // Debe dejar un sobrante de 14 FT
    expect(result.updatedRemainders).toHaveLength(1);
    expect(result.updatedRemainders[0].remainingLengthFt).toBe(14);
    expect(result.updatedRemainders[0].sku).toBe('TUB-38');
    expect(result.updatedRemainders[0].consumedByOrderIds).toContain('O-1');
  });

  it('Tubo requiere 8 FT con sobrante 14 FT -> Sage 0 FT, sobrante 6 FT', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: 'TUB-38', description: 'Tubo de 38mm', quantity: 8, unit: 'FT', orderId: 'O-2' }
    ];

    const existingRemainders: ReusableRemainder[] = [
      {
        id: 'R-1',
        sku: 'TUB-38',
        description: 'Tubo de 38mm',
        originalLengthFt: 19,
        remainingLengthFt: 14,
        consumedByOrderIds: ['O-1'],
        createdAt: new Date().toISOString(),
        status: 'available'
      }
    ];

    const result = calculateIssueLines(lines, existingRemainders);

    // No debe pedir a Sage porque el sobrante es suficiente
    expect(result.sageLines).toHaveLength(0);

    // Debe actualizar el sobrante a 6 FT
    expect(result.updatedRemainders).toHaveLength(1);
    expect(result.updatedRemainders[0].remainingLengthFt).toBe(6);
    expect(result.updatedRemainders[0].consumedByOrderIds).toContain('O-2');
  });

  it('Dos cortes de 5 FT y 8 FT en el mismo lote -> Sage solo 19 FT, sobrante 6 FT', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: 'TUB-38', description: 'Tubo de 38mm', quantity: 5, unit: 'FT', orderId: 'O-1' },
      { sku: 'TUB-38', description: 'Tubo de 38mm', quantity: 8, unit: 'FT', orderId: 'O-2' }
    ];

    const result = calculateIssueLines(lines, []);

    // Solo se debe pedir 1 barra de 19 FT a Sage
    expect(result.sageLines).toHaveLength(1);
    expect(result.sageLines[0].quantity).toBe(19);

    // El primer corte consume 5, dejando 14. El segundo consume 8 del sobrante, dejando 6.
    expect(result.updatedRemainders).toHaveLength(1);
    expect(result.updatedRemainders[0].remainingLengthFt).toBe(6);
    expect(result.updatedRemainders[0].consumedByOrderIds).toContain('O-1');
    expect(result.updatedRemainders[0].consumedByOrderIds).toContain('O-2');
  });

  it('Dos cortes de 12 FT y 12 FT -> Sage 38 FT, dos barras de 19 FT', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: 'TUB-38', description: 'Tubo de 38mm', quantity: 12, unit: 'FT' },
      { sku: 'TUB-38', description: 'Tubo de 38mm', quantity: 12, unit: 'FT' }
    ];

    const result = calculateIssueLines(lines, []);

    // Debe pedir 38 FT a Sage (19 + 19)
    expect(result.sageLines).toHaveLength(1);
    expect(result.sageLines[0].quantity).toBe(38);

    // Debe generar 2 sobrantes de 7 FT cada uno
    expect(result.updatedRemainders).toHaveLength(2);
    expect(result.updatedRemainders[0].remainingLengthFt).toBe(7);
    expect(result.updatedRemainders[1].remainingLengthFt).toBe(7);
  });

  it('No debe consumir sobrante de SKU diferente', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: 'TUB-50', description: 'Tubo de 50mm', quantity: 5, unit: 'FT' }
    ];

    const existingRemainders: ReusableRemainder[] = [
      {
        id: 'R-1',
        sku: 'TUB-38',
        description: 'Tubo de 38mm',
        originalLengthFt: 19,
        remainingLengthFt: 14,
        consumedByOrderIds: [],
        createdAt: new Date().toISOString(),
        status: 'available'
      }
    ];

    const result = calculateIssueLines(lines, existingRemainders);

    // Debe pedir 19 FT del nuevo tubo TUB-50 a Sage
    expect(result.sageLines).toHaveLength(1);
    expect(result.sageLines[0].itemCode).toBe('TUB-50');
    expect(result.sageLines[0].quantity).toBe(19);

    // Debe mantener el sobrante anterior y agregar uno nuevo
    expect(result.updatedRemainders).toHaveLength(2);
  });

  it('Tela se exporta en Y2 directo (exact_area)', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: 'TEL-01', description: 'Tela Screen', quantity: 2.55, unit: 'Y2' }
    ];

    const result = calculateIssueLines(lines, []);

    expect(result.sageLines).toHaveLength(1);
    expect(result.sageLines[0].itemCode).toBe('TEL-01');
    expect(result.sageLines[0].quantity).toBe(2.55); // Se exporta directo, la tela nunca pasa por pool de remainders
    expect(result.updatedRemainders).toHaveLength(0);
  });

  it('Bottomrail requiere 5 FT sin sobrante -> Sage 19 FT, sobrante 14 FT', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: 'BOT-01', description: 'Bottomrail', quantity: 5, unit: 'FT', orderId: 'O-1' }
    ];

    const result = calculateIssueLines(lines, []);

    // Bottomrail se descarga por barras de 19 FT
    expect(result.sageLines).toHaveLength(1);
    expect(result.sageLines[0].itemCode).toBe('BOT-01');
    expect(result.sageLines[0].quantity).toBe(19);

    expect(result.updatedRemainders).toHaveLength(1);
    expect(result.updatedRemainders[0].remainingLengthFt).toBe(14);
    expect(result.updatedRemainders[0].sku).toBe('BOT-01');
  });

  it('Bottomrail requiere 8 FT con sobrante 14 FT -> Sage 0 FT, sobrante 6 FT', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: 'BOT-01', description: 'Bottomrail', quantity: 8, unit: 'FT', orderId: 'O-2' }
    ];

    const existingRemainders: ReusableRemainder[] = [
      {
        id: 'R-1',
        sku: 'BOT-01',
        description: 'Bottomrail',
        originalLengthFt: 19,
        remainingLengthFt: 14,
        consumedByOrderIds: ['O-1'],
        createdAt: new Date().toISOString(),
        status: 'available'
      }
    ];

    const result = calculateIssueLines(lines, existingRemainders);

    expect(result.sageLines).toHaveLength(0);
    expect(result.updatedRemainders).toHaveLength(1);
    expect(result.updatedRemainders[0].remainingLengthFt).toBe(6);
  });

  it('Bottomrail no consume sobrante de SKU distinto', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: 'BOT-02', description: 'Bottomrail Curve', quantity: 5, unit: 'FT' }
    ];

    const existingRemainders: ReusableRemainder[] = [
      {
        id: 'R-1',
        sku: 'BOT-01',
        description: 'Bottomrail Flat',
        originalLengthFt: 19,
        remainingLengthFt: 14,
        consumedByOrderIds: [],
        createdAt: new Date().toISOString(),
        status: 'available'
      }
    ];

    const result = calculateIssueLines(lines, existingRemainders);

    expect(result.sageLines).toHaveLength(1);
    expect(result.sageLines[0].itemCode).toBe('BOT-02');
    expect(result.sageLines[0].quantity).toBe(19);

    expect(result.updatedRemainders).toHaveLength(2);
  });

  it('Tubo y Bottomrail no comparten sobrantes entre sí', () => {
    const lines: IssueEngineInputLine[] = [
      { sku: 'BOT-01', description: 'Bottomrail', quantity: 5, unit: 'FT' }
    ];

    const existingRemainders: ReusableRemainder[] = [
      {
        id: 'R-1',
        sku: 'TUB-38',
        description: 'Tubo de 38mm',
        originalLengthFt: 19,
        remainingLengthFt: 14,
        consumedByOrderIds: [],
        createdAt: new Date().toISOString(),
        status: 'available'
      }
    ];

    const result = calculateIssueLines(lines, existingRemainders);

    expect(result.sageLines).toHaveLength(1);
    expect(result.sageLines[0].itemCode).toBe('BOT-01');
    expect(result.sageLines[0].quantity).toBe(19);

    expect(result.updatedRemainders).toHaveLength(2);
  });
});
