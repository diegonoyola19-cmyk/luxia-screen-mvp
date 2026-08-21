import { useMemo } from 'react';
import { Button } from '../../../../components/ui/Button';
import { formatNumber } from '../../../../lib/format';
import { getOrderStatus, getClientReference } from './utils/orderDisplay';
import { bomDisplayLabel } from './utils/orderDisplay';
import { deriveAutoTone, type OrderReportRow } from './utils/orderReport';
import { generateRollerBOM, type BOMItem } from '../../../../logic/generateRollerBOM';
import { useCalculatorStore } from '../../store/useCalculatorStore';
import { canPerformOrderAction, canTransitionOrderStatus, type OrderWorkflowContext } from '../../../../domain/orders/orderWorkflow';
import { logAppActivity } from '../../../../lib/logAppActivity';
import { logOrderSentToProduction } from './utils/orderActivityMetadata';
import { useOrderWorkflowActions } from '../../../../hooks/useOrderWorkflowActions';

const M_TO_FT = 3.28084;

interface Props {
  selectedRow: OrderReportRow;
  onClose: () => void;
  isReadOnly: boolean;
  onReviewMaterials: (orderId: string) => void;
}

export function OrderDetailModal({ selectedRow, onClose, isReadOnly, onReviewMaterials }: Props) {
  const store = useCalculatorStore();
  const { isProcessing, sendToProduction, completeOrder } = useOrderWorkflowActions();
  const isBusy = isProcessing(selectedRow.order.id);
  const orderStatus = getOrderStatus(selectedRow.order);
  
  const syncStatus = store.syncMetadata[selectedRow.order.id];
  const context: OrderWorkflowContext = {
    isReadOnly,
    hasInventoryError: syncStatus?.status === 'error',
    hasMaterialReview: selectedRow.order.productionReview?.status === 'completed',
    inventoryAvailabilityResult: syncStatus?.inventoryAvailabilityResult,
  };

  const orderBOM = useMemo((): BOMItem[] => {
    if (!selectedRow) return [];
    const aggregated = new Map<string, BOMItem>();
    
    const isV3 = selectedRow.order.items.some(i => i.materialLines && i.materialLines.length > 0);

    if (isV3) {
      for (const item of selectedRow.order.items) {
        if (!item.materialLines) continue;
        for (const line of item.materialLines) {
          const sku = line.sageItemCode || line.itemCode;
          const existing = aggregated.get(sku);
          if (existing) {
            aggregated.set(sku, {
              ...existing,
              cantidadCalculada: parseFloat((existing.cantidadCalculada + line.quantity).toFixed(3)),
            });
          } else {
            aggregated.set(sku, {
              componente: line.description,
              skuBase: sku,
              skuFinal: sku,
              unidad: line.unit,
              cantidadCalculada: line.quantity,
              regla: ''
            });
          }
        }
      }
      return Array.from(aggregated.values());
    }

    for (const item of selectedRow.order.items) {
      const tone = item.input.hardwareTone ?? deriveAutoTone(item.input.fabricColor ?? '');
      const mounting = item.input.mountingSystem ?? 'standard';
      try {
        const bom = generateRollerBOM(
          item.input.widthMeters,
          item.input.heightMeters,
          tone as any,
          mounting
        );
        for (const bomItem of bom.items) {
          const existing = aggregated.get(bomItem.skuFinal);
          if (existing) {
            aggregated.set(bomItem.skuFinal, {
              ...existing,
              cantidadCalculada: parseFloat((existing.cantidadCalculada + bomItem.cantidadCalculada).toFixed(3)),
            });
          } else {
            aggregated.set(bomItem.skuFinal, { ...bomItem });
          }
        }
      } catch { /* skip */ }
    }
    return Array.from(aggregated.values());
  }, [selectedRow]);

  const handlePdf = async () => {
    try {
      const { generateOrderMaterialsPdf } = await import('../../../../lib/pdf/generateOrderMaterialsPdf');
      await generateOrderMaterialsPdf(selectedRow.order, store.productionInventory, store.inventoryMovements);
      
      logAppActivity({
        event_type: 'order.pdf_generated',
        entity_type: 'order',
        entity_id: selectedRow.order.id,
        metadata: {
          orderNumber: selectedRow.order.orderNumber,
          clientReference: getClientReference(selectedRow.order),
          status: orderStatus,
          generatedFrom: 'detail_modal'
        }
      });
    } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>Detalles: {selectedRow.order.orderNumber || `#${selectedRow.order.id.slice(0, 6)}`}</h2>
          <button className="modal-close-btn" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="modal-body">
          <div className="order-kpi-row" style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
            <div className="order-kpi-card" style={{ flex: 1, padding: '16px', background: 'var(--surface-container)', borderRadius: '8px' }}>
              <span className="label" style={{ fontSize: '12px', color: 'var(--muted)' }}>Piezas</span>
              <span className="val" style={{ display: 'block', fontSize: '24px', fontWeight: 700 }}>{selectedRow.summary.curtains}</span>
            </div>
            <div className="order-kpi-card" style={{ flex: 1, padding: '16px', background: 'var(--surface-container)', borderRadius: '8px' }}>
              <span className="label" style={{ fontSize: '12px', color: 'var(--muted)' }}>Costo Mat.</span>
              <span className="val" style={{ display: 'block', fontSize: '24px', fontWeight: 700 }}>${formatNumber(selectedRow.summary.totalOrderCost)}</span>
            </div>
            <div className={`order-kpi-card ${selectedRow.wastePercentage > 40 ? 'order-kpi-card--critical' : ''}`} style={{ flex: 1, padding: '16px', background: 'var(--surface-container)', borderRadius: '8px' }}>
              <span className="label" style={{ fontSize: '12px', color: 'var(--muted)' }}>Merma ✂️</span>
              <span className="val" style={{ display: 'block', fontSize: '24px', fontWeight: 700, color: selectedRow.wastePercentage > 40 ? 'var(--danger)' : 'inherit' }}>{formatNumber(selectedRow.wastePercentage)}%</span>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined">build</span> Herrajes / BOM
            </h3>
            {orderBOM.length > 0 ? (
              <table className="orders-data-table" style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th>Componente</th>
                    <th>SKU</th>
                    <th style={{ textAlign: 'right' }}>Cant.</th>
                  </tr>
                </thead>
                <tbody>
                  {orderBOM.map((item: any, i: number) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{bomDisplayLabel(item.componente, item.skuFinal)}</td>
                      <td style={{ fontFamily: 'monospace' }}>{item.skuFinal}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {item.unidad === 'm' ? `${(item.cantidadCalculada * M_TO_FT).toFixed(2)} ft` : `${item.cantidadCalculada} EA`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: 'var(--muted)' }}>No hay componentes calculados.</p>
            )}
          </div>

          <div>
            <h3 style={{ fontSize: '16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined">straighten</span> Dimensiones de Piezas
            </h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              {selectedRow.order.items.map((item: any, index: number) => (
                <div key={item.id} style={{ border: '1px solid var(--line)', padding: '12px', borderRadius: '8px', background: 'var(--surface-container)' }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                    Cortina {index + 1} - {formatNumber(item.input.widthMeters)} x {formatNumber(item.input.heightMeters)} m
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                    {item.result.selectedFabric ? `${item.result.selectedFabric.itemCode} - ${item.result.selectedFabric.color}` : `Rollo ${formatNumber(item.result.recommendedRollWidthMeters)} m`}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '13px' }}>
                    {item.reusedWastePiece ? (
                      <span style={{ color: '#059669', fontWeight: 600 }}>✓ Usa retazo ({formatNumber(item.reusedWastePiece.widthMeters)} x {formatNumber(item.reusedWastePiece.heightMeters)}m)</span>
                    ) : (
                      <span>Rollo: {formatNumber(item.result.recommendedRollWidthMeters)}m | Merma: {formatNumber(item.result.wastePercentage)}%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <span title={!canPerformOrderAction(selectedRow.order, 'export_pdf', context).allowed ? canPerformOrderAction(selectedRow.order, 'export_pdf', context).reason : 'Exportar PDF no cambia el estado de la orden'}>
            <Button type="button" variant="secondary" onClick={handlePdf} disabled={isBusy || !canPerformOrderAction(selectedRow.order, 'export_pdf', context).allowed}>
              📄 PDF
            </Button>
          </span>
          {orderStatus === 'ready_for_production' && (
            <span title={!canPerformOrderAction(selectedRow.order, 'send_to_production', context).allowed ? canPerformOrderAction(selectedRow.order, 'send_to_production', context).reason : undefined}>
              <Button type="button" variant="secondary" onClick={async () => {
                const result = await sendToProduction(selectedRow.order, context);
                if (result?.success) {
                  logOrderSentToProduction(selectedRow.order, 'order_detail_modal');
                }
              }} disabled={isBusy || !canPerformOrderAction(selectedRow.order, 'send_to_production', context).allowed}>
                {isBusy ? 'Reservando...' : 'Pasar a Producción'}
              </Button>
            </span>
          )}
          {orderStatus === 'in_production' && (
            <Button type="button" variant="primary" onClick={async () => {
              await completeOrder(selectedRow.order, context);
            }} disabled={isBusy}>
              {isBusy ? 'Consumiendo...' : '✓ Completar Producción'}
            </Button>
          )}
          {['ready_for_production', 'in_production', 'draft', 'materials_checked'].includes(orderStatus) && (
            <span title={!canPerformOrderAction(selectedRow.order, 'confirm_materials', context).allowed ? canPerformOrderAction(selectedRow.order, 'confirm_materials', context).reason : undefined}>
              <Button type="button" variant="secondary" onClick={() => onReviewMaterials(selectedRow.order.id)} disabled={isBusy || !canPerformOrderAction(selectedRow.order, 'confirm_materials', context).allowed}>
                👀 Materiales
              </Button>
            </span>
          )}
          {orderStatus === 'sent_to_sage' && (
            <span title={!canPerformOrderAction(selectedRow.order, 'revert_to_draft', context).allowed ? canPerformOrderAction(selectedRow.order, 'revert_to_draft', context).reason : undefined}>
              <Button type="button" variant="secondary" onClick={() => store.updateSavedOrderStatus(selectedRow.order.id, 'materials_checked')} disabled={isBusy || !canPerformOrderAction(selectedRow.order, 'revert_to_draft', context).allowed}>
                🔙 Revertir a Revisado
              </Button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
