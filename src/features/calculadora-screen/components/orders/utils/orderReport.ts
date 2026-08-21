import type { SavedOrder } from '../../../../../domain/curtains/types';
import { summarizeProduction } from '../../../../../lib/production';
import type { Tone } from '../../../../../logic/rollerEngineV3';

export interface OrderReportRow {
  order: SavedOrder;
  summary: ReturnType<typeof summarizeProduction>;
  wastePercentage: number;
  reusePercentage: number;
}

export function getReusePercentage(reusedArea: number, curtainArea: number) {
  return curtainArea === 0 ? 0 : (reusedArea / curtainArea) * 100;
}

export function deriveAutoTone(fabricColor: string): Tone {
  const c = fabricColor.toLowerCase();
  if (c.includes('grey') || c.includes('gray') || c.includes('stone') || c.includes('smoke')) return 'grey';
  if (c.includes('ivory') || c.includes('beige') || c.includes('sand') || c.includes('linen') ||
      c.includes('bisque') || c.includes('taupe') || c.includes('off white') || c.includes('fawn')) return 'ivory';
  if (c.includes('bronze') || c.includes('brown') || c.includes('ebony') || c.includes('chocolate') ||
      c.includes('gold') || c.includes('custard')) return 'bronze';
  return 'white';
}

export function getOrderReportRow(order: SavedOrder): OrderReportRow {
  const items = Array.isArray(order?.items) ? order.items : [];
  const summary = summarizeProduction(items);
  const reusedArea = items.reduce(
    (sum, item) => sum + (item?.reusedWastePiece?.areaM2 ?? 0),
    0,
  );

  return {
    order: {
      ...order,
      items,
    },
    summary,
    wastePercentage:
      summary.fabricDownloadedM2 === 0
        ? 0
        : (summary.fabricWasteM2 / summary.fabricDownloadedM2) * 100,
    reusePercentage: getReusePercentage(reusedArea, summary.curtainAreaM2),
  };
}
