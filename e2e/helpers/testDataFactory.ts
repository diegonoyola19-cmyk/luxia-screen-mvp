export interface CurtainInputData {
  family: string;
  openness: string;
  color: string;
  widthMeters: number;
  heightMeters: number;
  mountingSystem?: 'standard' | 'pin_endplug' | 'double_bracket';
  driveType?: 'manual' | 'motorized';
}

export class TestDataFactory {
  static createStandardCurtains(count = 1): CurtainInputData[] {
    const list: CurtainInputData[] = [];
    const sizes = [
      { w: 1.50, h: 2.00 },
      { w: 1.80, h: 2.20 },
      { w: 1.20, h: 1.60 },
      { w: 2.00, h: 2.40 },
      { w: 1.40, h: 1.90 },
      { w: 1.60, h: 2.10 },
      { w: 1.10, h: 1.50 },
      { w: 2.20, h: 2.30 },
      { w: 1.30, h: 1.70 },
      { w: 1.70, h: 2.00 },
    ];

    for (let i = 0; i < count; i++) {
      const s = sizes[i % sizes.length];
      list.push({
        family: 'Screen',
        openness: '1%',
        color: 'White',
        widthMeters: s.w,
        heightMeters: s.h,
        mountingSystem: 'standard',
        driveType: 'manual',
      });
    }
    return list;
  }

  static createEdgeCaseCurtains(): CurtainInputData[] {
    return [
      {
        family: 'Screen',
        openness: '1%',
        color: 'White',
        widthMeters: 2.85, // Double bracket width guard (>2.80m)
        heightMeters: 2.50,
        mountingSystem: 'double_bracket',
      },
      {
        family: 'Screen',
        openness: '1%',
        color: 'White',
        widthMeters: 3.10, // Oversized rotated (>3.00m)
        heightMeters: 2.20,
        mountingSystem: 'standard',
      },
      {
        family: 'Screen',
        openness: '3%',
        color: 'White',
        widthMeters: 2.40, // Edge roll fit
        heightMeters: 2.00,
        mountingSystem: 'standard',
      },
    ];
  }

  /**
   * Seeded Pseudo-Random Number Generator (LCG) for reproducible Chaos testing
   */
  static createPrng(seedNumber: number) {
    let state = seedNumber;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  static getChaosPayloads(seed: number): Array<{ type: string; value: string; description: string }> {
    const prng = this.createPrng(seed);
    const rawCases = [
      { type: 'zero', value: '0', description: 'Zero width' },
      { type: 'negative', value: '-1.50', description: 'Negative width' },
      { type: 'huge', value: '9999', description: 'Excessive dimension' },
      { type: 'alphanumeric', value: 'abc', description: 'Letters in numeric input' },
      { type: 'special_chars', value: '!@#$%', description: 'Special symbols' },
      { type: 'spaces', value: '   ', description: 'Whitespace only' },
      { type: 'tiny_decimal', value: '0.00001', description: 'Micro-dimension' },
      { type: 'sql_inject', value: "1'; DROP TABLE work_orders;--", description: 'SQL Injection string in order number' },
      { type: 'xss', value: '<script>alert(1)</script>', description: 'XSS snippet in order number' },
    ];

    // Shuffle using seed
    return [...rawCases].sort(() => prng() - 0.5);
  }
}
