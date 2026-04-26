import masterCatalog from '../data/luxia-price-catalog.json';
import rollerCatalog from '../data/luxia-roller-catalog.json';

export interface CatalogItem {
  itemCode: string;
  description: string;
  avgCost: number;
  unit: string;
  imageUrl?: string | null;
}

const allItems = [
  ...((masterCatalog as any).items || []),
  ...((rollerCatalog as any).items || [])
] as CatalogItem[];

// Mantenemos un mapa para acceso rápido por código
const itemByCode = new Map<string, CatalogItem>();
for (const item of allItems) {
  if (item.itemCode) {
    itemByCode.set(item.itemCode, item);
  }
}

export function searchCatalogItems(query: string, maxResults = 50): CatalogItem[] {
  if (!query || query.trim() === '') {
    return [];
  }

  // Función de normalización interna
  const normalize = (s: string) => {
    return s.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
      .replace(/1\s+1\/2|1\.5/g, '1½') // Normalizar 1 1/2 y 1.5 a 1½
      .replace(/['"()]/g, ' ') // Quitar comillas y paréntesis para búsqueda más limpia
      .trim();
  };

  const normalizedQuery = normalize(query);
  const searchTerms = normalizedQuery.split(/\s+/).filter(t => t.length > 0);

  if (searchTerms.length === 0) return [];

  const results: CatalogItem[] = [];

  for (const item of allItems) {
    if (!item.itemCode || !item.description) continue;

    const searchableText = normalize(`${item.itemCode} ${item.description}`);
    
    // Todos los términos de búsqueda deben estar en el texto
    const matchesAll = searchTerms.every(term => searchableText.includes(term));

    if (matchesAll) {
      results.push(item);
      if (results.length >= maxResults) {
        break;
      }
    }
  }

  return results;
}

export function getCatalogItemByCode(itemCode: string): CatalogItem | null {
  return itemByCode.get(itemCode) || null;
}
