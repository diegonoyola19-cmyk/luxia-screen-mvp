import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderDetailModal } from '../OrderDetailModal';
import { useCalculatorStore } from '../../../store/useCalculatorStore';
import * as logAppActivityModule from '../../../../../lib/logAppActivity';
import * as pdfModule from '../../../../../lib/pdf/generateOrderMaterialsPdf';
import * as orderActivityMetadata from '../utils/orderActivityMetadata';

vi.mock('../../../store/useCalculatorStore', () => ({
  useCalculatorStore: vi.fn(),
}));

vi.mock('../../../../../lib/logAppActivity', () => ({
  logAppActivity: vi.fn(),
}));

vi.mock('../../../../../lib/pdf/generateOrderMaterialsPdf', () => ({
  generateOrderMaterialsPdf: vi.fn().mockResolvedValue(true),
}));

vi.mock('../utils/orderActivityMetadata', () => ({
  logOrderSentToProduction: vi.fn()
}));

describe('OrderDetailModal', () => {
  const mockOrder = {
    id: 'test-order-1',
    orderNumber: 'ORD-123',
    status: 'draft',
    clientReference: 'Test Ref',
    items: [],
  };

  const mockSelectedRow = {
    order: mockOrder,
    summary: { curtains: 0, materialCost: 0, price: 0, isComplete: true }
  };

  const mockStore = {
    savedOrders: [mockOrder],
    productionInventory: [],
    inventoryMovements: [],
    updateSavedOrderStatus: vi.fn(),
    syncMetadata: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useCalculatorStore as any).mockReturnValue(mockStore);
  });

  it('Exportar PDF genera documento y registra log, pero no cambia estado', async () => {
    render(
      <OrderDetailModal 
        selectedRow={mockSelectedRow as any} 
        onClose={vi.fn()} 
        isReadOnly={false} 
        onReviewMaterials={vi.fn()} 
      />
    );

    const pdfBtn = screen.getByRole('button', { name: /PDF/i });
    fireEvent.click(pdfBtn);

    await waitFor(() => {
      expect(pdfModule.generateOrderMaterialsPdf).toHaveBeenCalledWith(
        mockOrder, mockStore.productionInventory, mockStore.inventoryMovements
      );
    });

    expect(mockStore.updateSavedOrderStatus).not.toHaveBeenCalled();

    expect(logAppActivityModule.logAppActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'order.pdf_generated',
        entity_id: 'test-order-1',
        metadata: expect.objectContaining({
          status: 'draft',
          generatedFrom: 'detail_modal'
        })
      })
    );
  });

  it('Pasar a Produccion cambia estado si el workflow lo permite', async () => {
    const readyOrder = { ...mockOrder, status: 'ready_for_production' };
    const readySelectedRow = { ...mockSelectedRow, order: readyOrder };
    
    render(
      <OrderDetailModal 
        selectedRow={readySelectedRow as any} 
        onClose={vi.fn()} 
        isReadOnly={false} 
        onReviewMaterials={vi.fn()} 
      />
    );

    const startBtn = screen.getByRole('button', { name: /Pasar a Producción/i });
    fireEvent.click(startBtn);

    expect(mockStore.updateSavedOrderStatus).toHaveBeenCalledWith('test-order-1', 'in_production');
    expect(orderActivityMetadata.logOrderSentToProduction).toHaveBeenCalledWith(readyOrder, 'order_detail_modal');
  });
});
