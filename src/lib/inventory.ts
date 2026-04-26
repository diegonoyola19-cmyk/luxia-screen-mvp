import { STORAGE_KEYS } from '../domain/curtains/constants';
import type {
  ComponentInventoryItem,
  FabricInventoryItem,
  InventoryMovement,
  LinearInventoryItem,
  ProductionInventory,
  SavedOrder,
  ScreenFixedComponent,
  ScreenRuleConfig,
  BaseRuleConfig,
} from '../domain/curtains/types';

const FEET_PER_METER = 3.28084;
const STOCK_BAR_METERS = 19 / FEET_PER_METER;
const TUBE_BOTTOM_DISCOUNT_METERS = 0.03;
const CUT_LOSS_METERS = 0.01;
const MIN_LINEAR_OFFCUT_METERS = 1;
const MIN_FABRIC_SCRAP_SIDE_METERS = 0.8;

function isBrowserAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function createId() {
  return crypto.randomUUID();
}

function slugCodePart(value: string) {
  const cleaned = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 3).toUpperCase())
    .join('');

  return cleaned || 'GEN';
}

function getNextCodeNumber(items: Array<{ code: string }>, prefix: string) {
  const numbers = items
    .map((item) => {
      const match = item.code.match(new RegExp(`^${prefix}-(\\d+)$`));
      return match ? Number(match[1]) : 0;
    })
    .filter((value) => value > 0);

  return (numbers.length === 0 ? 0 : Math.max(...numbers)) + 1;
}

function buildFabricScrapCode(inventory: ProductionInventory, color: string, openness: string) {
  const prefix = `RET-${slugCodePart(color)}-${slugCodePart(openness)}`;
  const nextNumber = getNextCodeNumber(inventory.fabrics, prefix);
  return `${prefix}-${String(nextNumber).padStart(3, '0')}`;
}

function buildLinearOffcutCode(
  items: LinearInventoryItem[],
  prefix: 'SOB-TUB' | 'SOB-BOT',
) {
  const nextNumber = getNextCodeNumber(items, prefix);
  return `${prefix}-${String(nextNumber).padStart(3, '0')}`;
}

export function getStockBarMeters() {
  return STOCK_BAR_METERS;
}

export function getMinLinearOffcutMeters() {
  return MIN_LINEAR_OFFCUT_METERS;
}

export function getMinFabricScrapSideMeters() {
  return MIN_FABRIC_SCRAP_SIDE_METERS;
}

export function createDefaultInventory(): ProductionInventory {
  const now = new Date().toISOString();

  return {
    fabrics: [
      {
        id: createId(),
        code: 'TEL-250-001',
        family: 'Screen',
        color: 'Blanco Hielo',
        openness: '5%',
        costPerYd2: 7.5,
        widthMeters: 2.5,
        lengthMeters: 18,
        kind: 'roll',
        createdAt: now,
        status: 'available',
      },
      {
        id: createId(),
        code: 'TEL-300-001',
        family: 'Screen',
        color: 'Gris Perla',
        openness: '5%',
        costPerYd2: 8.25,
        widthMeters: 3,
        lengthMeters: 14,
        kind: 'roll',
        createdAt: now,
        status: 'available',
      },
      {
        id: createId(),
        code: 'RET-001',
        family: 'Screen',
        color: 'Blanco Hielo',
        openness: '5%',
        costPerYd2: 7.5,
        widthMeters: 1.2,
        lengthMeters: 1.5,
        kind: 'scrap',
        createdAt: now,
        status: 'available',
      },
    ],
    tubes: [
      ...Array.from({ length: 4 }, (_, index) => ({
        id: createId(),
        code: `TUB-19-${index + 1}`,
        lengthMeters: STOCK_BAR_METERS,
        kind: 'bar' as const,
        createdAt: now,
        status: 'available' as const,
      })),
    ],
    bottoms: [
      ...Array.from({ length: 4 }, (_, index) => ({
        id: createId(),
        code: `BOT-19-${index + 1}`,
        lengthMeters: STOCK_BAR_METERS,
        kind: 'bar' as const,
        createdAt: now,
        status: 'available' as const,
      })),
    ],
    components: [
      { id: createId(), name: 'control', quantity: 30, createdAt: now },
      { id: createId(), name: 'soportes', quantity: 80, createdAt: now },
      { id: createId(), name: 'end plug', quantity: 40, createdAt: now },
      { id: createId(), name: 'chapita', quantity: 40, createdAt: now },
      { id: createId(), name: 'pesa de cadena', quantity: 25, createdAt: now },
      { id: createId(), name: 'tapaderas de bottom', quantity: 60, createdAt: now },
      { id: createId(), name: 'topes de cadena', quantity: 60, createdAt: now },
    ],
  };
}

export function loadProductionInventory(): ProductionInventory {
  if (!isBrowserAvailable()) {
    return createDefaultInventory();
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEYS.productionInventory);

  if (!rawValue) {
    return createDefaultInventory();
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<ProductionInventory>;

    return {
      fabrics: Array.isArray(parsed.fabrics)
        ? parsed.fabrics.map((item) => ({
            ...item,
            costPerYd2: typeof item.costPerYd2 === 'number' ? item.costPerYd2 : 0,
          }))
        : [],
      tubes: Array.isArray(parsed.tubes) ? parsed.tubes : [],
      bottoms: Array.isArray(parsed.bottoms) ? parsed.bottoms : [],
      components: Array.isArray(parsed.components) ? parsed.components : [],
    };
  } catch {
    return createDefaultInventory();
  }
}

export function saveProductionInventory(inventory: ProductionInventory) {
  if (!isBrowserAvailable()) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEYS.productionInventory,
    JSON.stringify(inventory),
  );
}

export function loadInventoryMovements(): InventoryMovement[] {
  if (!isBrowserAvailable()) {
    return [];
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEYS.inventoryMovements);

  if (!rawValue) {
    return [];
  }

  try {
    return JSON.parse(rawValue) as InventoryMovement[];
  } catch {
    return [];
  }
}

export function saveInventoryMovements(movements: InventoryMovement[]) {
  if (!isBrowserAvailable()) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEYS.inventoryMovements,
    JSON.stringify(movements),
  );
}

function allocateLinearItem(
  items: LinearInventoryItem[],
  requiredMeters: number,
  orderId: string,
  orderNumber: string,
  label: string,
  prefix: string,
): { items: LinearInventoryItem[]; movements: InventoryMovement[] } {
  const nextItems = [...items];
  const movements: InventoryMovement[] = [];
  const requiredWithLoss = requiredMeters + CUT_LOSS_METERS;
  const candidate = nextItems
    .filter((item) => item.status === 'available' && item.lengthMeters >= requiredWithLoss)
    .sort((left, right) => left.lengthMeters - right.lengthMeters)[0];

  if (!candidate) {
    return { items: nextItems, movements };
  }

  const index = nextItems.findIndex((item) => item.id === candidate.id);
  const remainder = candidate.lengthMeters - requiredWithLoss;

  nextItems[index] = {
    ...candidate,
    status: 'used',
    lengthMeters: 0,
  };

  movements.push({
    id: createId(),
    createdAt: new Date().toISOString(),
    orderId,
    orderNumber,
    category: label === 'tubo' ? 'tube' : 'bottom',
    action: 'consume',
    itemCode: candidate.code,
    itemLabel: label,
    quantity: requiredMeters,
    unit: 'm',
    notes: `Corte aplicado sobre ${candidate.kind === 'bar' ? 'barra completa' : 'sobrante'}.`,
  });

  if (remainder >= MIN_LINEAR_OFFCUT_METERS) {
    const offcutCode = buildLinearOffcutCode(nextItems, prefix as 'SOB-TUB' | 'SOB-BOT');

    nextItems.push({
      id: createId(),
      code: offcutCode,
      lengthMeters: remainder,
      kind: 'offcut',
      createdAt: new Date().toISOString(),
      status: 'available',
    });

    movements.push({
      id: createId(),
      createdAt: new Date().toISOString(),
      orderId,
      orderNumber,
      category: label === 'tubo' ? 'tube' : 'bottom',
      action: 'create_scrap',
      itemCode: offcutCode,
      itemLabel: `Sobrante de ${label}`,
      quantity: remainder,
      unit: 'm',
      notes: 'Sobrante lineal reutilizable generado por corte.',
    });
  } else if (remainder > 0) {
    movements.push({
      id: createId(),
      createdAt: new Date().toISOString(),
      orderId,
      orderNumber,
      category: label === 'tubo' ? 'tube' : 'bottom',
      action: 'discard',
      itemCode: candidate.code,
      itemLabel: `Descarte de ${label}`,
      quantity: remainder,
      unit: 'm',
      notes: 'Sobrante menor al minimo utilizable.',
    });
  }

  return { items: nextItems, movements };
}

function consumeComponents(
  components: ComponentInventoryItem[],
  fixedComponents: ScreenFixedComponent[],
  orderId: string,
  orderNumber: string,
): { components: ComponentInventoryItem[]; movements: InventoryMovement[] } {
  const nextComponents = [...components];
  const movements: InventoryMovement[] = [];

  fixedComponents.forEach((component) => {
    const index = nextComponents.findIndex(
      (item) => item.name.toLowerCase() === component.name.toLowerCase(),
    );

    if (index === -1) {
      return;
    }

    nextComponents[index] = {
      ...nextComponents[index],
      quantity: Math.max(0, nextComponents[index].quantity - component.quantity),
    };

    movements.push({
      id: createId(),
      createdAt: new Date().toISOString(),
      orderId,
      orderNumber,
      category: 'component',
      action: 'consume',
      itemCode: nextComponents[index].id,
      itemLabel: component.name,
      quantity: component.quantity,
      unit: component.unit,
    });
  });

  return { components: nextComponents, movements };
}

function matchesSelectedFabric(
  fabric: FabricInventoryItem,
  selectedFabric: SavedOrder['items'][number]['result']['selectedFabric'],
) {
  if (!selectedFabric) {
    return true;
  }

  return (
    fabric.code === selectedFabric.itemCode ||
    (fabric.family?.toLowerCase() === selectedFabric.family.toLowerCase() &&
      fabric.openness.toLowerCase() === selectedFabric.openness.toLowerCase() &&
      fabric.color.toLowerCase() === selectedFabric.color.toLowerCase())
  );
}

export function applyOrderToInventory(
  inventory: ProductionInventory,
  order: SavedOrder,
  ruleConfig: BaseRuleConfig,
): { inventory: ProductionInventory; movements: InventoryMovement[] } {
  let nextInventory: ProductionInventory = {
    fabrics: [...inventory.fabrics],
    tubes: [...inventory.tubes],
    bottoms: [...inventory.bottoms],
    components: [...inventory.components],
  };
  const movements: InventoryMovement[] = [
    {
      id: createId(),
      createdAt: new Date().toISOString(),
      orderId: order.id,
      orderNumber: order.orderNumber,
      category: 'order',
      action: 'create_order',
      itemCode: order.id,
      itemLabel: `Orden ${order.orderNumber}`,
      quantity: order.items.length,
      unit: 'cortinas',
      notes: order.orderNumber || 'Produccion',
    },
  ];

  order.items.forEach((item) => {
    const consumedLinearMeters =
      item.result.recommendedRollWidthMeters > 0
        ? item.result.fabricDownloadedM2 / item.result.recommendedRollWidthMeters
        : item.result.cutLengthMeters;

    if (item.reusedWastePiece?.id) {
      const fabricIndex = nextInventory.fabrics.findIndex(
        (fabric) => fabric.id === item.reusedWastePiece?.id,
      );

      if (fabricIndex !== -1) {
        const fabric = nextInventory.fabrics[fabricIndex];
        nextInventory.fabrics[fabricIndex] = { ...fabric, status: 'used', lengthMeters: 0 };
        movements.push({
          id: createId(),
          createdAt: new Date().toISOString(),
          orderId: order.id,
          orderNumber: order.orderNumber,
          category: 'fabric',
          action: 'use_scrap',
          itemCode: item.result.selectedFabric?.itemCode ?? fabric.code,
          itemLabel: item.result.selectedFabric
            ? `${item.result.selectedFabric.family} ${item.result.selectedFabric.openness} ${item.result.selectedFabric.color}`
            : `${fabric.color} ${fabric.widthMeters.toFixed(2)} x ${fabric.lengthMeters.toFixed(2)}`,
          quantity: 1,
          unit: 'retazo',
          notes: item.result.selectedFabric
            ? `${item.result.selectedFabric.itemCode} reutilizado desde retazo para ${item.title}.`
            : `Seleccionado manualmente por produccion para ${item.title}.`,
        });
      }
    } else {
      const candidatePool = nextInventory.fabrics
        .filter(
          (fabric) =>
            fabric.status === 'available' &&
            fabric.kind === 'roll' &&
            fabric.widthMeters === item.result.recommendedRollWidthMeters &&
            fabric.lengthMeters >= consumedLinearMeters,
        )
        .sort((left, right) => left.lengthMeters - right.lengthMeters);
      const candidate =
        candidatePool.find((fabric) => matchesSelectedFabric(fabric, item.result.selectedFabric)) ??
        candidatePool[0];

      if (candidate) {
        const index = nextInventory.fabrics.findIndex((fabric) => fabric.id === candidate.id);
        const remainingLength = candidate.lengthMeters - consumedLinearMeters;

        nextInventory.fabrics[index] = {
          ...candidate,
          lengthMeters: remainingLength,
        };

        movements.push({
          id: createId(),
          createdAt: new Date().toISOString(),
          orderId: order.id,
          orderNumber: order.orderNumber,
          category: 'fabric',
          action: 'consume',
          itemCode: item.result.selectedFabric?.itemCode ?? candidate.code,
          itemLabel: item.result.selectedFabric
            ? `${item.result.selectedFabric.family} ${item.result.selectedFabric.openness} ${item.result.selectedFabric.color}`
            : `${candidate.color} rollo ${candidate.widthMeters.toFixed(2)} m`,
          quantity: consumedLinearMeters,
          unit: 'm lineales',
          notes: item.result.selectedFabric
            ? `${item.result.selectedFabric.itemCode} - ${item.title} - ancho de tela ${item.result.recommendedRollWidthMeters.toFixed(2)} m.`
            : `${item.title} - ancho de tela ${candidate.widthMeters.toFixed(2)} m.`,
        });

        if (
          item.result.wastePieceWidthMeters >= MIN_FABRIC_SCRAP_SIDE_METERS &&
          item.result.wastePieceHeightMeters >= MIN_FABRIC_SCRAP_SIDE_METERS
        ) {
          const scrapCode = buildFabricScrapCode(
            nextInventory,
            candidate.color,
            candidate.openness,
          );

          nextInventory.fabrics.push({
            id: createId(),
            code: scrapCode,
            family: item.result.selectedFabric?.family ?? candidate.family,
            color: item.result.selectedFabric?.color ?? candidate.color,
            openness: item.result.selectedFabric?.openness ?? candidate.openness,
            imageUrl: item.result.selectedFabric?.imageUrl ?? candidate.imageUrl ?? null,
            costPerYd2: item.result.selectedFabric?.costPerYd2 ?? candidate.costPerYd2,
            widthMeters: item.result.wastePieceWidthMeters,
            lengthMeters: item.result.wastePieceHeightMeters,
            kind: 'scrap',
            createdAt: new Date().toISOString(),
            status: 'available',
          });

          movements.push({
            id: createId(),
            createdAt: new Date().toISOString(),
            orderId: order.id,
            orderNumber: order.orderNumber,
            category: 'fabric',
            action: 'create_scrap',
            itemCode: item.result.selectedFabric?.itemCode ?? scrapCode,
            itemLabel: item.result.selectedFabric
              ? `Retazo ${item.result.selectedFabric.family} ${item.result.selectedFabric.openness} ${item.result.selectedFabric.color}`
              : `Retazo ${candidate.color}`,
            quantity: item.result.wasteM2,
            unit: 'm2',
            notes: item.result.selectedFabric
              ? `${item.result.selectedFabric.itemCode} - ${item.result.wastePieceWidthMeters.toFixed(2)} x ${item.result.wastePieceHeightMeters.toFixed(2)} m`
              : `${item.result.wastePieceWidthMeters.toFixed(2)} x ${item.result.wastePieceHeightMeters.toFixed(2)} m`,
          });
        }
      }
    }

    const realLinearCutMeters = Math.max(
      item.input.widthMeters - TUBE_BOTTOM_DISCOUNT_METERS,
      0,
    );
    const tubeAllocation = allocateLinearItem(
      nextInventory.tubes,
      realLinearCutMeters,
      order.id,
      order.orderNumber,
      'tubo',
      'SOB-TUB',
    );
    nextInventory.tubes = tubeAllocation.items;
    movements.push(...tubeAllocation.movements);

    const bottomAllocation = allocateLinearItem(
      nextInventory.bottoms,
      realLinearCutMeters,
      order.id,
      order.orderNumber,
      'bottom',
      'SOB-BOT',
    );
    nextInventory.bottoms = bottomAllocation.items;
    movements.push(...bottomAllocation.movements);

    const componentConsumption = consumeComponents(
      nextInventory.components,
      item.result.fixedComponents,
      order.id,
      order.orderNumber,
    );
    nextInventory.components = componentConsumption.components;
    movements.push(...componentConsumption.movements);
  });

  return { inventory: nextInventory, movements };
}
