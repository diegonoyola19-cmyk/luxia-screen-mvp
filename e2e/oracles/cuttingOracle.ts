export interface ExpectedCuttingRow {
  rollWidth: number;
  usedWidth: number;
  wasteWidth: number;
  efficiencyPct: number;
}

export class CuttingOracle {
  static calculateExpectedRow(
    pieceWidths: number[],
    availableRollWidths: number[] = [2.50, 3.00]
  ): ExpectedCuttingRow {
    const sortedWidths = [...availableRollWidths].sort((a, b) => a - b);
    const totalCutWidth = pieceWidths.reduce((acc, w) => acc + (w + 0.10), 0);

    // Select smallest roll that fits
    const rollWidth = sortedWidths.find(rw => rw >= totalCutWidth) || sortedWidths[sortedWidths.length - 1];
    const wasteWidth = Math.max(0, rollWidth - totalCutWidth);
    const efficiencyPct = rollWidth > 0 ? (totalCutWidth / rollWidth) * 100 : 0;

    return {
      rollWidth: Number(rollWidth.toFixed(2)),
      usedWidth: Number(totalCutWidth.toFixed(2)),
      wasteWidth: Number(wasteWidth.toFixed(2)),
      efficiencyPct: Number(efficiencyPct.toFixed(1)),
    };
  }

  static verifyCuttingLayout(
    actual: { rollWidth?: number; usedWidth?: number; wasteWidth?: number; efficiencyPct?: number },
    expected: ExpectedCuttingRow,
    tolerance = 0.05
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (actual.rollWidth !== undefined && Math.abs(actual.rollWidth - expected.rollWidth) > tolerance) {
      issues.push(`Roll width mismatch: actual ${actual.rollWidth}m vs expected ${expected.rollWidth}m`);
    }

    if (actual.usedWidth !== undefined && Math.abs(actual.usedWidth - expected.usedWidth) > tolerance) {
      issues.push(`Used cut width mismatch: actual ${actual.usedWidth}m vs expected ${expected.usedWidth}m`);
    }

    if (actual.wasteWidth !== undefined && actual.wasteWidth < -0.001) {
      issues.push(`Impossible negative waste detected: ${actual.wasteWidth}m`);
    }

    if (actual.efficiencyPct !== undefined && (actual.efficiencyPct < 0 || actual.efficiencyPct > 100)) {
      issues.push(`Invalid efficiency percentage: ${actual.efficiencyPct}%`);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
