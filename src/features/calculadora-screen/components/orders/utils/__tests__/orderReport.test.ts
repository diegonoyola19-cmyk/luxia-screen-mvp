import { describe, it, expect } from 'vitest';
import { getOrderReportRow } from '../orderReport';
import { summarizeProduction, summarizeOrdersProduction } from '../../../../../../lib/production';
import type { SavedOrder } from '../../../../../../domain/curtains/types';

describe('orderReport & production summary - legacy data safety', () => {
  it('handles order with undefined items gracefully without crashing on reduce', () => {
    const legacyOrder: SavedOrder = {
      id: 'legacy-ord-1',
      orderNumber: 'LEGACY-001',
      status: 'ready_for_production',
      createdAt: '2026-08-21T00:00:00.000Z',
    } as any;

    expect(() => getOrderReportRow(legacyOrder)).not.toThrow();
    const row = getOrderReportRow(legacyOrder);
    expect(row.order.items).toEqual([]);
    expect(row.summary.curtains).toBe(0);
    expect(row.wastePercentage).toBe(0);
    expect(row.reusePercentage).toBe(0);
  });

  it('handles summarizeProduction with undefined or empty items', () => {
    expect(() => summarizeProduction(undefined)).not.toThrow();
    const summaryUndefined = summarizeProduction(undefined);
    expect(summaryUndefined.curtains).toBe(0);
    expect(summaryUndefined.totalOrderCost).toBe(0);

    expect(() => summarizeProduction([])).not.toThrow();
    const summaryEmpty = summarizeProduction([]);
    expect(summaryEmpty.curtains).toBe(0);
  });

  it('handles summarizeOrdersProduction with orders having missing items', () => {
    const orders: SavedOrder[] = [
      { id: '1', orderNumber: 'ORD-1', status: 'draft', createdAt: '' } as any,
      { id: '2', orderNumber: 'ORD-2', status: 'ready_for_production', createdAt: '', items: [] } as any,
    ];

    expect(() => summarizeOrdersProduction(orders)).not.toThrow();
    const summary = summarizeOrdersProduction(orders);
    expect(summary.curtains).toBe(0);
  });

  it('handles items with missing result, input, or fixedComponents without crashing', () => {
    const partialItems = [
      {
        id: 'item-1',
        title: 'Cortina Parcial',
        input: {} as any,
        result: {} as any,
      },
      {
        id: 'item-2',
        title: 'Cortina Sin Result',
      } as any,
    ];

    expect(() => summarizeProduction(partialItems as any)).not.toThrow();
    const summary = summarizeProduction(partialItems as any);
    expect(summary.curtains).toBe(2);
    expect(summary.fixedComponents).toEqual([]);
  });
});
