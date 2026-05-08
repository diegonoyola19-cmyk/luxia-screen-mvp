// src/logic/rollerResolver.ts

export type Tone = 'white' | 'grey' | 'ivory' | 'bronze';

export interface RollerSuggestion {
  tube: { sku: string; desc: string; cost: number };
  mechanism: { sku: string; desc: string; cost: number };
  brackets: { sku: string; desc: string; cost: number }[];
  adapters?: { sku: string; desc: string; cost: number }[];
}

// Catálogo interno extraído del histórico de Excel
const CATALOG = {
  tubes: {
    t38: { sku: '0-154-TU-38111', desc: '1½" (38mm) Alu. NEO Tube T6', cost: 0.554 },
    t45: { sku: '0-154-TU-45211', desc: '1¾" (45mm) Alu. Tube', cost: 1.475 },
    t50: { sku: '0-154-TU-50011', desc: '2" (50mm) Smooth Alu. Tube', cost: 1.181 },
    t63: { sku: '0-154-TU-63021', desc: '2½" (63mm) Struct. Alu. Tube', cost: 3.042 }
  },
  clutches: {
    t38: {
      white: { sku: '0-154-CL-V20WH', desc: 'Elegant Clutch VTX 20 - White', cost: 2.62 },
      grey: { sku: '0-154-CL-V20GR', desc: 'Elegant Clutch VTX 20 - Grey', cost: 2.63 },
      ivory: { sku: '0-154-CL-V20IV', desc: 'Elegant Clutch VTX 20 - Ivory', cost: 2.59 },
      bronze: { sku: '0-154-CL-V20BR', desc: 'Elegant Clutch VTX 20 - Brown', cost: 2.64 }
    },
    t45: {
      white: { sku: '0-154-CL-V30WH', desc: 'Elegant Clutch VTX 30 - White', cost: 5.90 },
      grey: { sku: '0-154-CL-V30WH', desc: 'Elegant Clutch VTX 30 - Grey (fallback)', cost: 5.90 },
      ivory: { sku: '0-154-CL-V30WH', desc: 'Elegant Clutch VTX 30 - Ivory (fallback)', cost: 5.90 },
      bronze: { sku: '0-154-CL-V30WH', desc: 'Elegant Clutch VTX 30 - Brown (fallback)', cost: 5.90 }
    }
  },
  motorBlocks: {
    t45: { sku: '0-154-PB-E060W', desc: 'Large Bracket with Motor Block', cost: 1.63 }
  },
  crownDrives: {
    t38: { sku: '6-700-AS-35040', desc: 'Crown & Drive for 35mm Motor & 38mm Tube', cost: 1.24 },
    t45: { sku: '6-700-AS-35045', desc: 'Crown & Drive for 35mm Motor & 45mm Tube', cost: 2.48 },
    t50: { sku: '6-700-AD-45063', desc: 'Drive for 45mm Motor and 63mm/50mm Tube', cost: 1.19 }
  },
  brackets: {
    medium: {
      white: { sku: '0-154-PB-E03WH', desc: 'EURO Medium Bracket | White', cost: 0.672 }
    },
    large: {
      white: { sku: '0-154-pb-e04wh', desc: 'EURO Large Bracket | White', cost: 0.722 }
    }
  }
};

/**
 * Motor experto de resolución técnica para cortinas Roller.
 * Basado en histórico real de Producción LUXIA.
 */
export function resolveRollerComponents(
  widthMeters: number,
  isMotorized: boolean,
  colorTone: Tone = 'white'
): RollerSuggestion {
  let suggestion: RollerSuggestion = {
    tube: CATALOG.tubes.t38,
    mechanism: CATALOG.clutches.t38.white,
    brackets: [],
    adapters: []
  };

  // 1. Resolver Breakpoints de Tubo y Brackets
  if (widthMeters <= 2.20) {
    suggestion.tube = CATALOG.tubes.t38;
    suggestion.brackets.push(CATALOG.brackets.medium.white);
    
    if (isMotorized) {
      suggestion.mechanism = CATALOG.motorBlocks.t45; // Típicamente usado para motor
      suggestion.adapters?.push(CATALOG.crownDrives.t38);
    } else {
      suggestion.mechanism = CATALOG.clutches.t38[colorTone] ?? CATALOG.clutches.t38.white;
    }
  } 
  else if (widthMeters > 2.20 && widthMeters <= 2.70) {
    suggestion.tube = CATALOG.tubes.t45;
    suggestion.brackets.push(CATALOG.brackets.large.white);

    if (isMotorized) {
      suggestion.mechanism = CATALOG.motorBlocks.t45;
      suggestion.adapters?.push(CATALOG.crownDrives.t45);
    } else {
      suggestion.mechanism = CATALOG.clutches.t45[colorTone] ?? CATALOG.clutches.t45.white;
    }
  } 
  else {
    // Heavy Duty (> 2.70m)
    suggestion.tube = CATALOG.tubes.t63; // o t50
    suggestion.brackets.push(CATALOG.brackets.large.white);

    if (isMotorized) {
      suggestion.mechanism = CATALOG.motorBlocks.t45;
      suggestion.adapters?.push(CATALOG.crownDrives.t50);
    } else {
      suggestion.mechanism = CATALOG.clutches.t45.white; // Heavy duty clutch (fallback a vtx30)
    }
  }

  return suggestion;
}
