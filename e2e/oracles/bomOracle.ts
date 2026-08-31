export interface ExpectedCurtainBOM {
  cutWidthMeters: number;
  cutHeightMeters: number;
  fabricYd2: number;
  tubeCutMeters: number;
  bottomrailCutMeters: number;
  chainLengthMeters: number;
  expectedTubeSku: string;
  expectedControlSku: string;
}

export class BomOracle {
  static calculateExpectedCurtain(
    widthMeters: number,
    heightMeters: number,
    mountingSystem: string = 'standard',
    hardwareTone: string = 'white'
  ): ExpectedCurtainBOM {
    const cutWidth = Number((widthMeters + 0.10).toFixed(4));
    const cutHeight = Number((heightMeters + 0.25).toFixed(4)); // 0.15 wrap + 0.05 pocket + 0.05 safety
    const fabricYd2 = Number(((cutWidth * cutHeight) * 1.19599).toFixed(4));
    const tubeCut = Number((widthMeters - 0.03).toFixed(4));
    const bottomrailCut = Number((widthMeters - 0.03).toFixed(4));
    const chainLength = Number((heightMeters * 2.0).toFixed(4));

    // Tube selection rule: W > 2.40 or H > 2.80 -> 50mm tube, else 38mm NEO
    const isHeavy = widthMeters > 2.40 || heightMeters > 2.80;
    const expectedTubeSku = isHeavy ? '0-154-TU-50001' : '0-154-TU-38111';

    let expectedControlSku = '0-153-CA-001WH';
    if (hardwareTone === 'grey') expectedControlSku = '0-153-CA-001GY';
    else if (hardwareTone === 'ivory') expectedControlSku = '0-153-CA-001IY';
    else if (hardwareTone === 'bronze') expectedControlSku = '0-153-CA-001BZ';

    return {
      cutWidthMeters: cutWidth,
      cutHeightMeters: cutHeight,
      fabricYd2,
      tubeCutMeters: tubeCut,
      bottomrailCutMeters: bottomrailCut,
      chainLengthMeters: chainLength,
      expectedTubeSku,
      expectedControlSku,
    };
  }

  static verifyActualBOM(actual: {
    cutWidthMeters?: number;
    cutHeightMeters?: number;
    tubeLength?: number;
    bottomrailLength?: number;
  }, expected: ExpectedCurtainBOM, tolerance = 0.02): { matches: boolean; discrepancies: string[] } {
    const discrepancies: string[] = [];

    if (actual.cutWidthMeters !== undefined) {
      if (Math.abs(actual.cutWidthMeters - expected.cutWidthMeters) > tolerance) {
        discrepancies.push(`Cut width mismatch: actual ${actual.cutWidthMeters}m vs expected ${expected.cutWidthMeters}m`);
      }
    }

    if (actual.cutHeightMeters !== undefined) {
      if (Math.abs(actual.cutHeightMeters - expected.cutHeightMeters) > tolerance) {
        discrepancies.push(`Cut height mismatch: actual ${actual.cutHeightMeters}m vs expected ${expected.cutHeightMeters}m`);
      }
    }

    if (actual.tubeLength !== undefined) {
      if (Math.abs(actual.tubeLength - expected.tubeCutMeters) > tolerance) {
        discrepancies.push(`Tube length mismatch: actual ${actual.tubeLength}m vs expected ${expected.tubeCutMeters}m`);
      }
    }

    if (actual.bottomrailLength !== undefined) {
      if (Math.abs(actual.bottomrailLength - expected.bottomrailCutMeters) > tolerance) {
        discrepancies.push(`Bottomrail length mismatch: actual ${actual.bottomrailLength}m vs expected ${expected.bottomrailCutMeters}m`);
      }
    }

    return {
      matches: discrepancies.length === 0,
      discrepancies,
    };
  }
}
