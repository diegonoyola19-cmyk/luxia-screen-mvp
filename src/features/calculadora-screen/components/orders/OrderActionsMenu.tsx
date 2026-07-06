import type React from 'react';
import { canPerformOrderAction, type OrderWorkflowContext } from '../../../../domain/orders/orderWorkflow';
import type { SavedOrder } from '../../../../domain/curtains/types';

interface Props {
  isOpen: boolean;
  order: SavedOrder;
  context: OrderWorkflowContext;
  onToggleMenu: (e: React.MouseEvent) => void;
  onViewDetails: () => void;
  onEditOrder: () => void;
  onViewPdf: () => void;
  onStartProduction: () => void;
  onReviewMaterials: () => void;
  onRevertToReviewed: () => void;
  onDelete: () => void;
}

export function OrderActionsMenu({
  isOpen,
  order,
  context,
  onToggleMenu,
  onViewDetails,
  onEditOrder,
  onViewPdf,
  onStartProduction,
  onReviewMaterials,
  onRevertToReviewed,
  onDelete
}: Props) {
  const status = order.status;

  const viewDetailsAction = canPerformOrderAction(order, 'view_details', context);
  const editAction = canPerformOrderAction(order, 'edit', context);
  const exportPdfAction = canPerformOrderAction(order, 'export_pdf', context);
  const startProductionAction = canPerformOrderAction(order, 'send_to_production', context);
  const confirmMaterialsAction = canPerformOrderAction(order, 'confirm_materials', context);
  const revertAction = canPerformOrderAction(order, 'revert_to_draft', context);
  const deleteAction = canPerformOrderAction(order, 'delete', context);

  return (
    <>
      <button
        className="action-menu-btn"
        onClick={onToggleMenu}
      >
        <span className="material-symbols-outlined">more_horiz</span>
      </button>

      {isOpen && (
        <div className="action-dropdown" onClick={(e) => e.stopPropagation()}>
          <span title={!viewDetailsAction.allowed ? viewDetailsAction.reason : undefined} style={{ display: 'block' }}>
            <button className="action-dropdown-item" onClick={onViewDetails} disabled={!viewDetailsAction.allowed}>
              <span className="material-symbols-outlined">visibility</span> Ver detalles
            </button>
          </span>

          {status === 'draft' && (
            <span title={!editAction.allowed ? editAction.reason : undefined} style={{ display: 'block' }}>
              <button className="action-dropdown-item" onClick={onEditOrder} disabled={!editAction.allowed}>
                <span className="material-symbols-outlined">edit</span> Editar orden
              </button>
            </span>
          )}

          <span title={!exportPdfAction.allowed ? exportPdfAction.reason : 'Exportar PDF no cambia el estado de la orden'} style={{ display: 'block' }}>
            <button className="action-dropdown-item" onClick={onViewPdf} disabled={!exportPdfAction.allowed}>
              <span className="material-symbols-outlined">picture_as_pdf</span> Ver PDF
            </button>
          </span>

          {status === 'ready_for_production' && (
            <span title={!startProductionAction.allowed ? startProductionAction.reason : undefined} style={{ display: 'block' }}>
              <button className="action-dropdown-item" onClick={onStartProduction} disabled={!startProductionAction.allowed}>
                <span className="material-symbols-outlined">play_arrow</span> Pasar a Producción
              </button>
            </span>
          )}

          {['ready_for_production', 'in_production', 'draft', 'materials_checked'].includes(status ?? '') && (
            <span title={!confirmMaterialsAction.allowed ? confirmMaterialsAction.reason : undefined} style={{ display: 'block' }}>
              <button className="action-dropdown-item" onClick={onReviewMaterials} disabled={!confirmMaterialsAction.allowed}>
                <span className="material-symbols-outlined">inventory</span> Confirmar Materiales
              </button>
            </span>
          )}

          {status === 'sent_to_sage' && (
            <span title={!revertAction.allowed ? revertAction.reason : undefined} style={{ display: 'block' }}>
              <button className="action-dropdown-item" onClick={onRevertToReviewed} disabled={!revertAction.allowed}>
                <span className="material-symbols-outlined">undo</span> Revertir a Revisado
              </button>
            </span>
          )}

          <span title={!deleteAction.allowed ? deleteAction.reason : undefined} style={{ display: 'block' }}>
            <button className="action-dropdown-item danger" onClick={onDelete} disabled={!deleteAction.allowed}>
              <span className="material-symbols-outlined">delete</span> Eliminar
            </button>
          </span>
        </div>
      )}
    </>
  );
}
