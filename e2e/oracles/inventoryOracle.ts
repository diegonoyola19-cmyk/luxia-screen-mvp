import { SandboxInventoryItem, SandboxInventoryMovement } from '../state/sandboxSeed';

export interface InventorySnapshot {
  timestamp: string;
  items: Array<{ id: string; code: string; availableStock: number; status: string }>;
  movementsCount: number;
}

export class InventoryOracle {
  static takeSnapshot(items: SandboxInventoryItem[], movements: SandboxInventoryMovement[]): InventorySnapshot {
    return {
      timestamp: new Date().toISOString(),
      items: items.map(i => ({
        id: i.id,
        code: i.code,
        availableStock: i.payload?.available_yd2 ?? i.payload?.available_quantity ?? 0,
        status: i.status,
      })),
      movementsCount: movements.length,
    };
  }

  static verifyInvariants(
    before: InventorySnapshot,
    after: InventorySnapshot,
    expectedDelta: { code: string; consumed: number }[]
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for negative stock
    for (const item of after.items) {
      if (item.availableStock < 0) {
        errors.push(`Negative stock detected on ${item.code}: ${item.availableStock}`);
      }
    }

    // Check expected consumption deltas
    for (const exp of expectedDelta) {
      const bItem = before.items.find(i => i.code === exp.code);
      const aItem = after.items.find(i => i.code === exp.code);
      if (!bItem || !aItem) {
        errors.push(`Item ${exp.code} not found in snapshots`);
        continue;
      }
      const actualDelta = Number((bItem.availableStock - aItem.availableStock).toFixed(3));
      const expectedConsumed = Number(exp.consumed.toFixed(3));
      if (Math.abs(actualDelta - expectedConsumed) > 0.05) {
        errors.push(`Stock consumption mismatch on ${exp.code}: expected -${expectedConsumed}, actual change: -${actualDelta}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  static verifyRollback(
    initial: InventorySnapshot,
    postRollback: InventorySnapshot,
    tolerance = 0.05
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const initItem of initial.items) {
      const currItem = postRollback.items.find(i => i.id === initItem.id);
      if (!currItem) {
        errors.push(`Item ${initItem.id} missing after rollback`);
        continue;
      }
      if (Math.abs(currItem.availableStock - initItem.availableStock) > tolerance) {
        errors.push(`Rollback incomplete on ${initItem.code}: was ${initItem.availableStock}, now ${currItem.availableStock}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
