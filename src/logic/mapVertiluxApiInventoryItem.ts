export interface VertiluxApiRawItem {
  ITEMNO: string;
  DESCRIPTION: string;
  UNIT: string | null;
  QTYONHAND: string | number | null;
  QTYSALORDR: string | number | null;
  QTYONORDER: string | number | null;
  QTYOFFSET: string | number | null;
}

export type MapVertiluxResult =
  | {
      success: true;
      item: {
        category: 'fabric';
        kind: 'roll';
        status: 'available';
        code: string;
        payload: {
          source: 'vertilux_api';
          sourceItemNo: string;
          description: string;
          apiUnit: string;
          apiQtyOnHand: number;
          apiQtySalesOrder: number;
          apiQtyOnOrder: number;
          apiQtyOffset: number | null;
          apiAvailableRaw: number;
          apiAvailableYd2: number;
          available_yd2: number;
          width_meters: number;
          length_meters: number;
          family: string;
          openness: string;
          color: string;
          isVirtualRoll: boolean;
          lastApiSyncAt: string;
        };
      };
    }
  | { success: false; status: 'skipped'; reason: string; code: string; description: string };

function asNumber(value: string | number | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = Number(value.replace(/,/g, ''));
    return Number.isFinite(normalized) ? normalized : 0;
  }
  return 0;
}

function inferCategory(description: string): string {
  const normalized = description.toLowerCase();
  if (
    normalized.includes('screen') ||
    normalized.includes('premium') ||
    normalized.includes('pinpoint') ||
    normalized.includes('pinpointe') ||
    normalized.includes('blackout')
  ) {
    return 'fabric';
  }
  return 'other';
}

function extractWidthMeters(description: string): number | null {
  const match = description.match(/(\d+(?:\.\d+)?)"/);
  if (!match) return null;
  const inches = Number(match[1]);
  if (!Number.isFinite(inches)) return null;
  return inches * 0.0254;
}

function inferFamily(description: string): string {
  const normalized = description.toLowerCase();
  if (normalized.includes('pinpoint') || normalized.includes('pinpointe')) return 'Pinpointe';
  if (normalized.includes('premium')) return 'Premium';
  if (normalized.includes('screen')) return 'Screen';
  return 'Tela';
}

function inferOpenness(family: string, description: string): string {
  const normalized = description.toLowerCase();
  if (family === 'Screen') {
    const match = normalized.match(/3000-(\d+)/);
    if (match) return `${match[1]}%`;
    if (normalized.includes('decorative')) return 'Decorative';
    const visionMatch = normalized.match(/calico\s+(\d+)/);
    if (visionMatch) return visionMatch[1];
    return 'Screen';
  }
  if (normalized.includes('blackout')) return 'Blackout';
  return 'Tela';
}

function inferColor(family: string, description: string): string {
  const withoutWidth = description.replace(/\s+\d+(?:\.\d+)?"\s*$/i, '').trim();
  let normalizedColor = withoutWidth;

  if (family === 'Screen') {
    normalizedColor = withoutWidth
      .replace(/^.*?screen\s+/i, '')
      .replace(/^3000-\d+\s*/i, '')
      .replace(/^decorative\s+/i, '')
      .replace(/^calico\s+\d+\s*/i, '')
      .replace(/^vision\s+/i, '')
      .trim();
  } else if (family === 'Premium') {
    normalizedColor = withoutWidth
      .replace(/^.*?premium(?:\s+plus)?\s*/i, '')
      .replace(/^blackout\s*/i, '')
      .replace(/^fr\s*/i, '')
      .trim();
  } else if (family === 'Pinpointe') {
    normalizedColor = withoutWidth
      .replace(/^.*?pin(?:point|pointe)(?:\s+matte)?\s*/i, '')
      .replace(/^blackout\s*/i, '')
      .replace(/^fr\s*/i, '')
      .trim();
  }

  normalizedColor = normalizedColor
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/^\W+|\W+$/g, '')
    .trim();

  return normalizedColor || 'Sin color';
}

export function mapVertiluxApiInventoryItem(rawItem: VertiluxApiRawItem, syncTimestamp: string = new Date().toISOString()): MapVertiluxResult {
  const code = (rawItem.ITEMNO || '').trim();
  const description = (rawItem.DESCRIPTION || '').trim();

  if (!code) {
    return { success: false, status: 'skipped', reason: 'MISSING_ITEMNO', code, description };
  }

  const category = inferCategory(description);
  if (category !== 'fabric') {
    return { success: false, status: 'skipped', reason: 'NOT_FABRIC', code, description };
  }

  const unit = (rawItem.UNIT || '').trim().toLowerCase();
  
  if (unit === 'ea' || unit === '1') {
    return { success: false, status: 'skipped', reason: 'UNIT_AMBIGUOUS', code, description };
  }

  const width_meters = extractWidthMeters(description);
  if (width_meters === null || width_meters <= 0) {
    return { success: false, status: 'skipped', reason: 'MISSING_WIDTH_METERS', code, description };
  }

  const apiQtyOnHand = asNumber(rawItem.QTYONHAND);
  const apiQtySalesOrder = asNumber(rawItem.QTYSALORDR);
  
  let apiAvailableRaw = apiQtyOnHand - apiQtySalesOrder;
  if (apiAvailableRaw < 0) {
    apiAvailableRaw = 0; // clamp to 0
  }

  let available_yd2 = 0;
  if (unit === 'sqyd' || unit === 'yd2') {
    available_yd2 = apiAvailableRaw;
  } else if (unit === 'metro²' || unit === 'mt²') {
    available_yd2 = apiAvailableRaw * 1.1959900463;
  } else if (unit === 'yd') {
    available_yd2 = apiAvailableRaw * 0.9144 * width_meters * 1.1959900463;
  } else {
    return { success: false, status: 'skipped', reason: 'UNIT_UNKNOWN', code, description };
  }

  const length_meters = available_yd2 / (width_meters * 1.1959900463);
  const family = inferFamily(description);
  const openness = inferOpenness(family, description);
  const color = inferColor(family, description);

  return {
    success: true,
    item: {
      category: 'fabric',
      kind: 'roll',
      status: 'available',
      code,
      payload: {
        source: 'vertilux_api',
        sourceItemNo: code,
        description,
        apiUnit: rawItem.UNIT || '',
        apiQtyOnHand,
        apiQtySalesOrder,
        apiQtyOnOrder: asNumber(rawItem.QTYONORDER),
        apiQtyOffset: rawItem.QTYOFFSET !== null ? asNumber(rawItem.QTYOFFSET) : null,
        apiAvailableRaw,
        apiAvailableYd2: available_yd2,
        available_yd2,
        width_meters,
        length_meters,
        family,
        openness,
        color,
        isVirtualRoll: true,
        lastApiSyncAt: syncTimestamp,
      },
    },
  };
}
