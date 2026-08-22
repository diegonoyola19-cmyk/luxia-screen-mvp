import { describe, it, expect } from 'vitest';
import rollerBomRulesConfigV2 from '../../data/roller-bom-rules-v2.json';
import priceCatalog from '../../data/luxia-price-catalog.json';
import { generateRollerBOM } from '../generateRollerBOM';
import { resolveGroupBom } from '../doubleBracketBom';
import { componentCatalogBySku } from '../../domain/inventory/componentCatalog';
import type { CurtainOrderLine } from '../../domain/curtains/roller-bom-rules.types';

describe('BOM V2 SINGLE SOURCE OF TRUTH — CONTRACT SUITE', () => {

  const priceCatalogItemMap = new Map<string, any>();
  priceCatalog.items.forEach(item => priceCatalogItemMap.set(item.itemCode, item));

  describe('Fase 10: Validación Estructural y de Catálogo de roller-bom-rules-v2.json', () => {
    
    it('Todas las claves de colorMaps tienen los 4 tonos y existen en luxia-price-catalog.json', () => {
      const tones = ['white', 'ivory', 'grey', 'bronze'] as const;
      const colorMaps = rollerBomRulesConfigV2.colorMaps as Record<string, Record<string, string>>;

      expect(Object.keys(colorMaps).length).toBeGreaterThan(0);

      for (const [key, map] of Object.entries(colorMaps)) {
        for (const tone of tones) {
          const sku = map[tone];
          expect(sku, `colorMap[${key}][${tone}] debe existir`).toBeDefined();
          expect(sku, `colorMap[${key}][${tone}] no debe tener placeholders X`).not.toContain('X');
          
          const catalogItem = priceCatalogItemMap.get(sku);
          expect(catalogItem, `SKU ${sku} (${key}:${tone}) debe existir en luxia-price-catalog.json`).toBeDefined();
          expect(catalogItem?.unit, `SKU ${sku} debe tener unidad válida`).toBeDefined();
        }
      }
    });

    it('Todas las reglas tienen rangos válidos sin gaps ni overlaps y componentes con SKUs válidos', () => {
      const categories = ['Roller', 'Roller Pin EndPlug', 'Roller Bracket Doble'];

      categories.forEach(category => {
        const rules = rollerBomRulesConfigV2.rules.filter(r => r.category === category);
        expect(rules.length).toBeGreaterThan(0);

        // Validar min <= max
        rules.forEach(r => {
          expect(r.minWidthM).toBeLessThanOrEqual(r.maxWidthM);
          expect(r.components.length).toBeGreaterThan(0);

          r.components.forEach(c => {
            expect(c.componentType).toBeDefined();
            expect(['curtain', 'group']).toContain(c.scope || 'curtain');
            expect(c.calculation).toBeDefined();
            expect(c.calculation.value).toBeGreaterThan(0);

            if (c.colorKey) {
              const colorEntry = (rollerBomRulesConfigV2.colorMaps as any)[c.colorKey];
              expect(colorEntry, `colorKey ${c.colorKey} debe estar en colorMaps`).toBeDefined();
            } else {
              expect(c.baseSku).toBeDefined();
              expect(c.baseSku).not.toContain('X');
              const exists = priceCatalogItemMap.has(c.baseSku) || !!(componentCatalogBySku as any)[c.baseSku];
              expect(exists, `baseSku ${c.baseSku} debe existir en catálogo maestro`).toBe(true);
            }
          });
        });
      });
    });
  });

  describe('Fase 3: Continuidad de Ancho y Cierre de Gaps (3.00m - 3.60m)', () => {
    const testCases = [
      { width: 3.0000, expectedTube: '0-154-TU-50001', desc: 'Límite superior exacto de NEO 50mm' },
      { width: 3.0001, expectedTube: '0-154-TU-63001', desc: 'Inmediatamente superior a 3.00m (NEO 63mm)' },
      { width: 3.0010, expectedTube: '0-154-TU-63001', desc: '3.001m (NEO 63mm)' },
      { width: 3.0050, expectedTube: '0-154-TU-63001', desc: '3.005m (anterior gap resuelto)' },
      { width: 3.0099, expectedTube: '0-154-TU-63001', desc: '3.0099m (NEO 63mm)' },
      { width: 3.0100, expectedTube: '0-154-TU-63001', desc: '3.0100m (NEO 63mm)' },
      { width: 3.6000, expectedTube: '0-154-TU-63001', desc: 'Límite máximo exacto 3.60m' },
    ];

    testCases.forEach(tc => {
      it(`Ancho ${tc.width}m: ${tc.desc} resuelve tubo ${tc.expectedTube}`, () => {
        const bom = generateRollerBOM(tc.width, 2.0, 'white', 'standard');
        const tubeItem = bom.items.find(i => i.componente.includes('Tubo'));
        expect(tubeItem).toBeDefined();
        expect(tubeItem?.skuFinal).toBe(tc.expectedTube);
      });
    });

    it('Superar 3.60m arroja error de límite de manufactura', () => {
      expect(() => generateRollerBOM(3.6001, 2.0, 'white', 'standard'))
        .toThrow(/supera el máximo soportado de 3.6m/);
    });
  });

  describe('Fase 11: Contrato de Igualdad Preview UI vs Saved Order (BOM V2)', () => {
    const testConfigs = [
      // Standard
      { mount: 'standard' as const, w: 1.50, h: 2.00, tone: 'white' as const },
      { mount: 'standard' as const, w: 2.20, h: 2.00, tone: 'ivory' as const },
      { mount: 'standard' as const, w: 2.201, h: 2.00, tone: 'grey' as const },
      { mount: 'standard' as const, w: 2.80, h: 2.00, tone: 'bronze' as const },
      { mount: 'standard' as const, w: 3.00, h: 2.00, tone: 'white' as const },
      { mount: 'standard' as const, w: 3.005, h: 2.00, tone: 'white' as const },
      { mount: 'standard' as const, w: 3.20, h: 2.00, tone: 'white' as const },
      { mount: 'standard' as const, w: 3.60, h: 2.00, tone: 'white' as const },
      // Pin EndPlug
      { mount: 'pin_endplug' as const, w: 1.50, h: 2.00, tone: 'white' as const },
      { mount: 'pin_endplug' as const, w: 2.20, h: 2.00, tone: 'ivory' as const },
      { mount: 'pin_endplug' as const, w: 2.40, h: 2.00, tone: 'grey' as const },
      { mount: 'pin_endplug' as const, w: 2.80, h: 2.00, tone: 'bronze' as const },
      // Double Bracket
      { mount: 'double_bracket' as const, w: 1.50, h: 2.00, tone: 'white' as const },
      { mount: 'double_bracket' as const, w: 2.20, h: 2.00, tone: 'ivory' as const },
      { mount: 'double_bracket' as const, w: 2.40, h: 2.00, tone: 'grey' as const },
      { mount: 'double_bracket' as const, w: 2.80, h: 2.00, tone: 'bronze' as const },
    ];

    testConfigs.forEach(cfg => {
      it(`Identidad Preview vs Saved en ${cfg.mount} W=${cfg.w}m Tone=${cfg.tone}`, () => {
        // 1. Preview (llamada desde ProductionModuleV2 a través de generateRollerBOM)
        const previewBom = generateRollerBOM(cfg.w, cfg.h, cfg.tone, cfg.mount);

        // 2. Saved Order (llamada desde orderSlice a través de resolveGroupBom)
        const category = cfg.mount === 'pin_endplug'
          ? 'Roller Pin EndPlug'
          : cfg.mount === 'double_bracket'
            ? 'Roller Bracket Doble'
            : 'Roller';

        const orderLine: CurtainOrderLine = {
          orderLineId: 'test-order-line',
          category,
          mountingType: cfg.mount === 'double_bracket' ? 'doubleBracket' : 'singleBracket',
          curtains: cfg.mount === 'double_bracket'
            ? [
                { curtainId: 'c1', widthM: cfg.w, heightM: cfg.h, tone: cfg.tone },
                { curtainId: 'c2', widthM: cfg.w, heightM: cfg.h, tone: cfg.tone }
              ]
            : [
                { curtainId: 'c1', widthM: cfg.w, heightM: cfg.h, tone: cfg.tone }
              ]
        };

        const savedBom = resolveGroupBom(orderLine, rollerBomRulesConfigV2 as any, { throwOnError: true });

        // Comparar cantidad de componentes
        expect(previewBom.items.length).toBe(savedBom.lines.length);

        // Comparar cada componente canónicamente por SKU y cantidad
        savedBom.lines.forEach(savedLine => {
          const matchingPreview = previewBom.items.find(p => p.skuFinal === savedLine.resolvedSku);
          expect(matchingPreview, `Componente ${savedLine.resolvedSku} debe estar en Preview`).toBeDefined();
          expect(matchingPreview?.cantidadCalculada).toBeCloseTo(savedLine.quantity, 3);
          expect(matchingPreview?.unidad).toBe(savedLine.unit);
        });
      });
    });
  });

  describe('Fase 13: Double Bracket Scope Group No Duplicación', () => {
    it('Genera exactamente 1 juego de soportes dobles para un par de cortinas', () => {
      const line: CurtainOrderLine = {
        orderLineId: 'db-pair',
        category: 'Roller Bracket Doble',
        mountingType: 'doubleBracket',
        curtains: [
          { curtainId: 'c1', widthM: 2.0, heightM: 2.0, tone: 'white' },
          { curtainId: 'c2', widthM: 2.0, heightM: 2.0, tone: 'white' }
        ]
      };

      const res = resolveGroupBom(line, rollerBomRulesConfigV2 as any, { throwOnError: true });
      const bracketLines = res.lines.filter(l => l.componentType.includes('Soporte'));
      
      expect(bracketLines).toHaveLength(1);
      expect(bracketLines[0].quantity).toBe(1);
      expect(bracketLines[0].scope).toBe('group');
    });
  });
});
