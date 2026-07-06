import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OrderActionsMenu } from '../OrderActionsMenu';
import type { SavedOrder } from '../../../../../domain/curtains/types';
import type { OrderWorkflowContext } from '../../../../../domain/orders/orderWorkflow';

describe('OrderActionsMenu', () => {
  const mockOrder: SavedOrder = {
    id: 'test-order-1',
    orderNumber: 'ORD-123',
    status: 'draft',
    createdAt: new Date().toISOString(),
    items: [],
  };

  const baseProps = {
    isOpen: true,
    order: mockOrder,
    context: { isReadOnly: false } as OrderWorkflowContext,
    onToggleMenu: vi.fn(),
    onViewDetails: vi.fn(),
    onEditOrder: vi.fn(),
    onViewPdf: vi.fn(),
    onStartProduction: vi.fn(),
    onReviewMaterials: vi.fn(),
    onRevertToReviewed: vi.fn(),
    onDelete: vi.fn(),
  };

  it('muestra title con motivo cuando la accion esta bloqueada por readonly', () => {
    const readonlyContext = { ...baseProps.context, isReadOnly: true };
    render(<OrderActionsMenu {...baseProps} context={readonlyContext} />);

    // El boton "Eliminar" debe estar deshabilitado y su padre span tener el title.
    const deleteButton = screen.getByRole('button', { name: /Eliminar/i });
    expect(deleteButton).toBeDisabled();

    const spanWrapper = deleteButton.parentElement;
    expect(spanWrapper).toHaveAttribute('title', 'El usuario tiene permisos de solo lectura');
  });

  it('no muestra title cuando la accion esta permitida', () => {
    render(<OrderActionsMenu {...baseProps} />);

    // Borrador puede ser editado y eliminado
    const editButton = screen.getByRole('button', { name: /Editar orden/i });
    expect(editButton).not.toBeDisabled();
    
    const spanWrapper = editButton.parentElement;
    expect(spanWrapper).not.toHaveAttribute('title');
  });
});
