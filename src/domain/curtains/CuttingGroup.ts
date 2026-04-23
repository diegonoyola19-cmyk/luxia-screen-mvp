import { ProductionBatchItem } from './types';

/**
 * Entidad pura que representa un corte físico de tela que puede contener una o varias cortinas.
 */
export interface CuttingGroup {
  id: string;
  fabricFamily: string;
  fabricColor: string;
  rollWidth: number;          // Ancho del rollo elegido (ej: 2.50)
  items: ProductionBatchItem[]; // Cortinas agrupadas en este corte
  totalCutWidth: number;      // Suma de anchos de corte + márgenes entre piezas
  cutHeight: number;          // Máximo alto de corte entre todas las cortinas del grupo
  waste: number;              // Merma lateral = rollWidth - totalCutWidth
  yd2Consumed: number;        // Yardas cuadradas totales consumidas por este corte
  error?: string;             // Error si no cabe en ningún rollo
}
