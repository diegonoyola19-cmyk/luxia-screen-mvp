import type { InventoryItem } from '../domain/inventory/types';
import { componentCatalogBySku } from '../domain/inventory/componentCatalog';

export const selectGlobalFabricsForBodega = (items: InventoryItem[]) => {
  return items
    .filter(i => i.category === 'fabric' && i.status === 'available' && i.kind === 'scrap')
    .map(i => ({
      id: i.id,
      code: i.code || i.id.substring(0, 8).toUpperCase(),
      family: i.payload?.family,
      color: i.payload?.color,
      openness: i.payload?.openness || 'N/A',
      widthMeters: (i.payload?.width_meters as number) || (i.payload?.widthMeters as number) || 0,
      lengthMeters: (i.payload?.length_meters as number) || (i.payload?.lengthMeters as number) || 0,
      orderNumber: i.payload?.source_order_number || 'Corte de Prod.',
      createdAt: i.created_at,
      status: i.status,
      kind: 'scrap'
    }));
};

export const selectGlobalLinearsForBodega = (items: InventoryItem[]) => {
  return items
    .filter(i => (i.category === 'tube' || i.category === 'bottom') && i.status === 'available')
    .map(i => {
      const catalogEntry = componentCatalogBySku[i.code];
      return {
        id: i.id,
        code: i.code || i.id.substring(0, 8).toUpperCase(),
        kind: i.category,
        itemType: i.category === 'tube' ? 'Tubo' : 'Bottomrail',
        sku: i.code,
        description: (i.payload?.description as string) || catalogEntry?.marketName || 'Sin descripción',
        remainingLengthM: (i.payload?.length_meters as number) || (i.payload?.lengthMeters as number) || 0,
        sourceOrderNumber: i.payload?.source_order_number || 'Corte de Prod.',
        createdAt: i.created_at,
        status: i.status,
        color: (i.payload?.color as string) || catalogEntry?.marketName || i.code
      };
    });
};
