import { InventoryItem } from '../domain/inventory/types';
import { componentCatalogBySku } from '../domain/inventory/componentCatalog';

export const selectGlobalFabricsForBodega = (items: InventoryItem[]) => {
  return items
    .filter(i => i.material_kind === 'fabric' && i.status === 'available' && i.type === 'scrap')
    .map(i => ({
      id: i.id,
      code: i.code || i.id.substring(0,8).toUpperCase(),
      family: i.payload?.family,
      color: i.payload?.color,
      openness: i.payload?.openness || 'N/A',
      widthMeters: i.payload?.width_meters || 0,
      lengthMeters: i.payload?.length_meters || 0,
      orderNumber: i.payload?.source_order_number || 'Corte de Prod.',
      createdAt: i.created_at,
      status: i.status,
      kind: 'scrap'
    }));
};

export const selectGlobalLinearsForBodega = (items: InventoryItem[]) => {
  return items
    .filter(i => (i.material_kind === 'tube' || i.material_kind === 'bottomrail') && i.status === 'available')
    .map(i => {
      const catalogEntry = componentCatalogBySku[i.sku];
      return {
        id: i.id,
        code: i.code || i.id.substring(0,8).toUpperCase(),
        kind: i.material_kind,
        itemType: i.material_kind === 'tube' ? 'Tubo' : 'Bottomrail',
        sku: i.sku,
        description: i.payload?.description || catalogEntry?.marketName || 'Sin descripción',
        remainingLengthM: i.payload?.length_meters || 0,
        sourceOrderNumber: i.payload?.source_order_number || 'Corte de Prod.',
        createdAt: i.created_at,
        status: i.status,
        color: i.payload?.color || catalogEntry?.marketName || i.sku
      };
    });
};
