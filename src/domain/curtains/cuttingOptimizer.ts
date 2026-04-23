import { CuttingGroup } from './CuttingGroup';
import { ProductionBatchItem, ScreenRuleConfig } from './types';
import { DEFAULT_SCREEN_RULE_CONFIG, YARD2_PER_M2, generateId } from './constants';

/**
 * Optimiza la agrupación de cortinas en rollos para minimizar la merma total.
 * Implementa una búsqueda exhaustiva para encontrar la combinación óptima de (cortinas x ancho de rollo).
 */
export function optimizeCuts(
  items: ProductionBatchItem[],
  availableWidths: number[],
  config: ScreenRuleConfig = DEFAULT_SCREEN_RULE_CONFIG
): CuttingGroup[] {
  if (items.length === 0) return [];

  // Fallback de anchos si el catálogo no provee ninguno
  const widths = availableWidths.length > 0 
    ? [...availableWidths].sort((a, b) => a - b) 
    : [2.5, 3.0];

  // 1. Agrupar items por tela y color para optimizarlos por separado
  const groupsByFabric: Record<string, ProductionBatchItem[]> = {};
  items.forEach(item => {
    const key = `${item.input.fabricFamily}|${item.input.fabricColor}`;
    if (!groupsByFabric[key]) groupsByFabric[key] = [];
    groupsByFabric[key].push(item);
  });

  const result: CuttingGroup[] = [];

  // 2. Optimizar cada grupo de tela de forma independiente
  Object.values(groupsByFabric).forEach(fabricItems => {
    const optimizedGroups = findBestPartition(fabricItems, widths, config);
    result.push(...optimizedGroups);
  });

  return result;
}

/**
 * Busca la partición de cortinas que minimiza la merma total usando recursión.
 * Para N pequeño (típico en cortinas), garantiza el óptimo global.
 */
function findBestPartition(
  items: ProductionBatchItem[],
  widths: number[],
  config: ScreenRuleConfig
): CuttingGroup[] {
  // Pre-calcular el ancho de corte individual para cada item
  const itemWidths = items.map(it => ({
    item: it,
    cutWidth: it.input.widthMeters + 0.10, // Encuadre base
    cutHeight: it.input.heightMeters + config.cutHeightExtraMeters + 0.10
  }));

  let bestSolution: CuttingGroup[] = [];
  let minTotalWaste = Infinity;

  /**
   * Genera todas las particiones posibles (agrupaciones)
   */
  function solve(index: number, currentGroups: ProductionBatchItem[][]) {
    if (index === items.length) {
      // Hemos asignado todas las cortinas. Evaluar esta solución.
      const solutionGroups: CuttingGroup[] = [];
      let totalWaste = 0;
      let possible = true;

      for (const groupItems of currentGroups) {
        const groupStats = calculateGroupStats(groupItems, widths, config);
        if (groupStats.error && groupItems.length > 1) {
          // Si un grupo de varias cortinas no cabe en ningún rollo, esta partición no es válida
          // (Aunque si es una sola cortina y no cabe, se permite pero con error)
          possible = false;
          break;
        }
        solutionGroups.push(groupStats);
        totalWaste += groupStats.waste;
      }

      if (possible) {
        // Criterio de desempate: menor merma, luego menor número de cortes
        if (totalWaste < minTotalWaste || (totalWaste === minTotalWaste && solutionGroups.length < bestSolution.length)) {
          minTotalWaste = totalWaste;
          bestSolution = [...solutionGroups];
        }
      }
      return;
    }

    // Probar poner el item en cada uno de los grupos existentes
    for (let i = 0; i < currentGroups.length; i++) {
      currentGroups[i].push(items[index]);
      solve(index + 1, currentGroups);
      currentGroups[i].pop();
    }

    // Probar crear un nuevo grupo para este item
    currentGroups.push([items[index]]);
    solve(index + 1, currentGroups);
    currentGroups.pop();
  }

  // Si hay demasiados items (ej: > 10), la recursión pura es lenta.
  // En producción real de cortinas de un solo color, > 10 es raro.
  // Limitamos para evitar cuelgues si el usuario agrega 50 cortinas iguales.
  // Si hay demasiados items (ej: > 7), la recursión pura es lenta (Números de Bell crecen rápido).
  if (items.length > 7) {
    return firstFitDecreasing(items, widths, config);
  }

  solve(0, []);
  return bestSolution;
}

/**
 * Calcula las métricas de un grupo específico y selecciona el rollo más eficiente.
 */
function calculateGroupStats(
  groupItems: ProductionBatchItem[],
  widths: number[],
  config: ScreenRuleConfig
): CuttingGroup {
  const fabricFamily = groupItems[0].input.fabricFamily;
  const fabricColor = groupItems[0].input.fabricColor;

  let totalCutWidth = 0;
  let maxCutHeight = 0;

  groupItems.forEach((it, idx) => {
    const w = Number(it.input.widthMeters) || 0;
    totalCutWidth += (w + 0.10);
    if (idx > 0) totalCutWidth += 0.05; // Margen entre piezas
    
    const h = (Number(it.input.heightMeters) || 0) + config.cutHeightExtraMeters + 0.10;
    if (h > maxCutHeight) maxCutHeight = h;
  });

  // Buscar el rollo más pequeño en el que quepa
  const validRolls = widths.filter(w => w >= totalCutWidth).sort((a, b) => a - b);
  const rollWidth = validRolls.length > 0 ? validRolls[0] : (widths[widths.length - 1] || 3.0);
  
  const waste = rollWidth - totalCutWidth;
  const error = totalCutWidth > rollWidth ? 'Ancho excedido' : undefined;

  const m2 = rollWidth * maxCutHeight;
  const yd2Consumed = m2 * YARD2_PER_M2;

  return {
    id: generateId(),
    fabricFamily,
    fabricColor,
    rollWidth,
    items: groupItems,
    totalCutWidth,
    cutHeight: maxCutHeight,
    waste,
    yd2Consumed,
    error
  };
}

/**
 * Heurística First Fit Decreasing para cuando hay demasiados items.
 */
function firstFitDecreasing(
  items: ProductionBatchItem[],
  widths: number[],
  config: ScreenRuleConfig
): CuttingGroup[] {
  const sorted = [...items].sort((a, b) => b.input.widthMeters - a.input.widthMeters);
  const groups: ProductionBatchItem[][] = [];

  sorted.forEach(item => {
    let placed = false;
    for (const group of groups) {
      // Verificar si cabe en el rollo más grande disponible
      const maxRoll = widths[widths.length - 1];
      const tempGroup = [...group, item];
      const stats = calculateGroupStats(tempGroup, widths, config);
      if (!stats.error) {
        group.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) {
      groups.push([item]);
    }
  });

  return groups.map(g => calculateGroupStats(g, widths, config));
}
