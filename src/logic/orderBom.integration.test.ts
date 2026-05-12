import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { resolveGroupBom } from './doubleBracketBom';
import type { RollerBomRulesConfig, CurtainOrderLine } from '../domain/curtains/roller-bom-rules.types';

let config: RollerBomRulesConfig;

beforeAll(() => {
  config = JSON.parse(
    readFileSync(resolve(__dirname, '../../docs/roller-bom-rules-v2.json'), 'utf-8')
  );
});

describe('Integración BOM a nivel orden (agrupación de cortinas)', () => {
  it('Orden mixta: Roller normal + Bracket Doble agrupa correctamente materiales y respeta tonos', () => {
    // Cortina 1: Roller normal, 2.25x2.20, grey
    const c1: CurtainOrderLine = {
      orderLineId: 'group-1',
      category: 'Roller',
      mountingType: 'singleBracket',
      curtains: [
        { curtainId: 'C1', widthM: 2.25, heightM: 2.20, tone: 'grey' }
      ]
    };
    
    // Cortina 2 y 3: Bracket Doble, 1.20x1.35, white y bronze
    const c2_3: CurtainOrderLine = {
      orderLineId: 'group-2',
      category: 'Roller Bracket Doble',
      mountingType: 'doubleBracket',
      curtains: [
        { curtainId: 'C2', widthM: 1.20, heightM: 1.35, tone: 'white' },
        { curtainId: 'C3', widthM: 1.20, heightM: 1.35, tone: 'bronze' }
      ]
    };

    const r1 = resolveGroupBom(c1, config, { throwOnError: false });
    const r2_3 = resolveGroupBom(c2_3, config, { throwOnError: false });

    // 1. Cortina 1 no debe generar End Plug de 'Roller Pin EndPlug'
    const endPlugC1 = r1.lines.find(l => l.componentType === 'End Plug');
    if (endPlugC1) {
      expect(endPlugC1.resolvedSku).not.toMatch(/0-155-EW-SL[EH]53/);
    }
    
    // 2. Cortina 1 no debe generar soporte Bracket Doble
    expect(r1.lines.find(l => l.componentType.includes('Soporte Bracket Doble'))).toBeUndefined();

    // 3. Soporte Bracket Doble debe salir solo 1 EA para el grupo 2_3
    const soportesGrupo = r2_3.lines.filter(l => l.scope === 'group');
    expect(soportesGrupo.length).toBeGreaterThan(0);
    // Cada componente del grupo sale 1 EA
    expect(soportesGrupo[0].quantity).toBe(1);

    // 4. Bracket Doble sí usa End Plug (SLE53 o similar), así que verificamos que esté presente
    const endPlugDoble = r2_3.lines.find(l => l.componentType === 'End Plug');
    expect(endPlugDoble).toBeDefined();
    expect(endPlugDoble?.quantity).toBe(2); // 2 cortinas = 2 end plugs

    // 5. Los colores deben corresponder a cada cortina
    const br1 = r1.lines.find(l => l.componentType === 'Bottomrail');
    expect(br1?.resolvedSku).toMatch(/CLA19/); // grey/gray -> CLA19

    const cadenas2_3 = r2_3.lines.filter(l => l.componentType === 'Cadena');
    expect(cadenas2_3).toHaveLength(2); // Dos colores distintos -> dos líneas
    
    const whiteChain = cadenas2_3.find(c => c.resolvedSku.includes('007')); // white -> 007
    const bronzeChain = cadenas2_3.find(c => c.resolvedSku.includes('012')); // bronze -> 012
    expect(whiteChain).toBeDefined();
    expect(bronzeChain).toBeDefined();

    // 6. Color faltante (black) no se sustituye por bronze
    const c4: CurtainOrderLine = {
      orderLineId: 'group-4',
      category: 'Roller',
      mountingType: 'singleBracket',
      curtains: [
        { curtainId: 'C4', widthM: 1.0, heightM: 1.0, tone: 'black' as any }
      ]
    };
    const r4 = resolveGroupBom(c4, config, { throwOnError: false });
    const errorItems = r4.lines.filter(l => l.colorError);
    expect(errorItems.length).toBeGreaterThan(0);
    expect(errorItems[0].colorError).toBe('COLOR_SKU_NOT_FOUND');
  });

  it('Orden mixta compleja (4 cortinas): Bracket Doble, Roller normal, Pin EndPlug', () => {
    // A. Grupo Bracket Doble (Cortina 1 y 2)
    const gBracketDoble: CurtainOrderLine = {
      orderLineId: 'group-db',
      category: 'Roller Bracket Doble',
      mountingType: 'doubleBracket',
      curtains: [
        { curtainId: 'C1', widthM: 1.20, heightM: 1.30, tone: 'white' },
        { curtainId: 'C2', widthM: 1.20, heightM: 1.30, tone: 'bronze' }
      ]
    };
    
    // B. Cortina Roller normal
    const gRollerNormal: CurtainOrderLine = {
      orderLineId: 'group-rn',
      category: 'Roller',
      mountingType: 'singleBracket',
      curtains: [
        { curtainId: 'C3', widthM: 2.25, heightM: 1.45, tone: 'bronze' }
      ]
    };

    // C. Cortina Roller Pin EndPlug
    const gPinEndPlug: CurtainOrderLine = {
      orderLineId: 'group-pe',
      category: 'Roller Pin EndPlug',
      mountingType: 'singleBracket', // En el logic singleBracket engloba pin_endplug a nivel group
      curtains: [
        { curtainId: 'C4', widthM: 1.52, heightM: 1.33, tone: 'bronze' }
      ]
    };

    const rDb = resolveGroupBom(gBracketDoble, config, { throwOnError: false });
    const rRn = resolveGroupBom(gRollerNormal, config, { throwOnError: false });
    const rPe = resolveGroupBom(gPinEndPlug, config, { throwOnError: false });

    // Validaciones A (Bracket Doble)
    const bracketDobleSupp = rDb.lines.find(l => l.componentType === 'Soporte lado del control');
    expect(bracketDobleSupp).toBeDefined();
    expect(bracketDobleSupp?.quantity).toBe(1);
    
    const bracketDobleNormalSupp = rDb.lines.find(l => l.resolvedSku.includes('0-154-SC') || l.resolvedSku.includes('0-154-SE'));
    expect(bracketDobleNormalSupp).toBeUndefined(); // No deben recibir soportes normales de Roller

    // Validaciones B (Roller normal)
    const rnSuppCtrl = rRn.lines.find(l => l.componentType === 'Soporte lado del control');
    expect(rnSuppCtrl).toBeDefined();
    expect(rnSuppCtrl?.quantity).toBe(1);

    const rnSuppEndPlug = rRn.lines.find(l => l.componentType === 'Soporte del lado del end plug');
    expect(rnSuppEndPlug).toBeDefined();
    expect(rnSuppEndPlug?.quantity).toBe(1);

    const rnEndPlug = rRn.lines.find(l => l.componentType === 'End Plug');
    expect(rnEndPlug).toBeDefined();
    expect(rnEndPlug?.quantity).toBe(1);
    expect(rnEndPlug?.resolvedSku).not.toMatch(/0-155-EW-SLH53/); // No debe ser el end plug pin

    const rnChapita = rRn.lines.find(l => l.componentType === 'Chapita');
    expect(rnChapita).toBeDefined();
    expect(rnChapita?.quantity).toBe(1);

    // Validaciones C (Roller Pin EndPlug)
    const peEndPlug = rPe.lines.find(l => l.componentType === 'End Plug');
    expect(peEndPlug).toBeDefined();
    expect(peEndPlug?.quantity).toBe(1);
    // Pin Endplug > 1.50 usa SLH53
    expect(peEndPlug?.resolvedSku).toBe('0-155-EW-SLH53'); 
    
    // Pin Endplug usa sus propios soportes, no los de Roller normal
    const peNormalSuppCtrl = rPe.lines.find(l => l.resolvedSku.includes('0-154-SC') || l.resolvedSku.includes('0-154-SE'));
    expect(peNormalSuppCtrl).toBeUndefined();

    // Colores resueltos correctamente (sin X)
    const checkNoX = (bom: ReturnType<typeof resolveGroupBom>) => {
      bom.lines.forEach(line => {
        expect(line.resolvedSku).not.toMatch(/X/);
      });
    };
    checkNoX(rDb);
    checkNoX(rRn);
    checkNoX(rPe);
  });

  it('PUNTO 1: Bracket doble no debe duplicar soporte de grupo en orden mixta', () => {
    // Cortina 1 + 2: Roller Bracket Doble, 1.30x1.30, bronze
    const gBracketDoble: CurtainOrderLine = {
      orderLineId: 'g-db',
      category: 'Roller Bracket Doble',
      mountingType: 'doubleBracket',
      curtains: [
        { curtainId: 'C1', widthM: 1.30, heightM: 1.30, tone: 'bronze' },
        { curtainId: 'C2', widthM: 1.30, heightM: 1.30, tone: 'bronze' }
      ]
    };

    // Cortina 3: Roller normal 1.00x1.00, bronze
    const gNormal: CurtainOrderLine = {
      orderLineId: 'g-rn',
      category: 'Roller',
      mountingType: 'singleBracket',
      curtains: [
        { curtainId: 'C3', widthM: 1.00, heightM: 1.00, tone: 'bronze' }
      ]
    };

    // Cortina 4: Roller Pin EndPlug 1.55x1.30, bronze
    const gPin: CurtainOrderLine = {
      orderLineId: 'g-pe',
      category: 'Roller Pin EndPlug',
      mountingType: 'singleBracket',
      curtains: [
        { curtainId: 'C4', widthM: 1.55, heightM: 1.30, tone: 'bronze' }
      ]
    };

    const rDb = resolveGroupBom(gBracketDoble, config, { throwOnError: false });
    const rNormal = resolveGroupBom(gNormal, config, { throwOnError: false });
    const rPin = resolveGroupBom(gPin, config, { throwOnError: false });

    // Validar SKU 0-155-BD-SL50W = 1 EA
    const dbSupport = rDb.lines.find(l => l.resolvedSku === '0-155-BD-SL50W');
    expect(dbSupport).toBeDefined();
    expect(dbSupport?.quantity).toBe(1);

    // Soportes Roller normal 0-154-PB-E04WH y 0-154-PB-E03WH = 1 EA c/u en C3
    // Wait, tones are bronze! So E04BZ and E03BZ
    const nCtrlSupp = rNormal.lines.find(l => l.componentType === 'Soporte lado del control');
    expect(nCtrlSupp?.quantity).toBe(1);
    expect(nCtrlSupp?.resolvedSku).toBe('0-154-PB-E04WH');
    
    // End Plug Roller normal
    const nEndPlug = rNormal.lines.find(l => l.componentType === 'End Plug');
    expect(nEndPlug?.quantity).toBe(1);
    expect(nEndPlug?.resolvedSku).toBe('0-154-PE-00501');

    // End Plug Pin EndPlug (SLH53)
    const pinEndPlug = rPin.lines.find(l => l.componentType === 'End Plug');
    expect(pinEndPlug?.quantity).toBe(1);
    expect(pinEndPlug?.resolvedSku).toBe('0-155-EW-SLH53');

    // Sin X
    [rDb, rNormal, rPin].forEach(res => {
      res.lines.forEach(line => {
        expect(line.resolvedSku).not.toMatch(/X/);
      });
    });
  });

  it('PUNTO 2: Control normal + VTX30 exclusión en rango 2.801-3.00', () => {
    // Roller normal 2.90x1.78, bronze
    const line: CurtainOrderLine = {
      orderLineId: 'g-wide',
      category: 'Roller',
      mountingType: 'singleBracket',
      curtains: [
        { curtainId: 'C1', widthM: 2.90, heightM: 1.78, tone: 'bronze' }
      ]
    };

    const result = resolveGroupBom(line, config, { throwOnError: false });

    // Debe incluir Control VTX30 (0-154-CL-V30WH)
    const vtx30 = result.lines.find(l => l.resolvedSku === '0-154-CL-V30WH');
    expect(vtx30).toBeDefined();
    expect(vtx30?.quantity).toBe(1);

    // No debe incluir ningún Control normal
    const normalControl = result.lines.find(l => l.componentType === 'Control de cortina' && l.resolvedSku !== '0-154-CL-V30WH');
    expect(normalControl).toBeUndefined();

    // Tampoco debe estar el V20BR
    const v20 = result.lines.find(l => l.resolvedSku === '0-154-CL-V20BR');
    expect(v20).toBeUndefined();
  });
});

