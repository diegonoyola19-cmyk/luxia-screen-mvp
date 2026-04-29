import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import xlsx from 'xlsx';

const defaultInputPath = 'C:\\Users\\diego\\Downloads\\BASE PARA PRECIOS (1).xlsx';
const inputPath = process.argv[2] ?? defaultInputPath;
const outputPath = process.argv[3] ?? path.resolve('src/data/luxia-roller-catalog.json');
const itemCatalogOutputPath = process.argv[4] ?? path.resolve('src/data/luxia-item-catalog.json');

const workbook = xlsx.readFile(inputPath, { cellDates: false });
const priceSheet = workbook.Sheets.LUXIA;
const dataSheet = workbook.Sheets.DATA;

if (!priceSheet) {
  throw new Error('No se encontro la hoja "LUXIA" en el archivo.');
}

const priceRows = xlsx.utils.sheet_to_json(priceSheet, {
  defval: null,
});
const dataRows = dataSheet
  ? xlsx.utils.sheet_to_json(dataSheet, {
      range: 1,
      defval: null,
    })
  : [];

const imageByItemCode = new Map();

for (const row of dataRows) {
  const itemCode = asTrimmedString(row.ITEM);

  if (!itemCode) {
    continue;
  }

  imageByItemCode.set(itemCode, {
    codeWithoutDashes: asTrimmedString(row['CODIGO SIN GUION']),
    imageUrl: asTrimmedString(row['LINK DE IMAGEN']),
    barcode: asTrimmedString(row['CODIGO DE BARRA']),
  });
}

const items = priceRows
  .map((row) => {
    const itemCode = asTrimmedString(row.ITEM);

    if (!itemCode) {
      return null;
    }

    const metadata = imageByItemCode.get(itemCode);

    return {
      itemCode,
      description: asTrimmedString(row.Description),
      avgCost: asNumber(row.AVGCOST),
      unit:
        asTrimmedString(row['UNIDAD DE MEDIDA ']) ??
        asTrimmedString(row['UNIDAD DE MEDIDA']),
      salePrice:
        asNumber(row['PRECIO DE VENTA ']) ?? asNumber(row['PRECIO DE VENTA']),
      volumePrice: asNumber(row['PRECIO VOLUMEN']),
      comment:
        asTrimmedString(row['COMENTARIO ']) ?? asTrimmedString(row.COMENTARIO),
      extraComment: asTrimmedString(row.__EMPTY),
      codeWithoutDashes: metadata?.codeWithoutDashes ?? null,
      imageUrl: metadata?.imageUrl ?? null,
      barcode: metadata?.barcode ?? null,
    };
  })
  .filter(Boolean)
  .sort((left, right) => left.itemCode.localeCompare(right.itemCode, 'es'));

const rollerItems = items
  .map(toRollerCatalogItem)
  .filter(Boolean)
  .sort((left, right) => left.itemCode.localeCompare(right.itemCode, 'es'));

const catalogItems = items
  .map(toCatalogItem)
  .sort((left, right) => left.itemCode.localeCompare(right.itemCode, 'es'));

const payload = {
  generatedAt: new Date().toISOString(),
  sourceFile: inputPath,
  totalItems: rollerItems.length,
  items: rollerItems,
};

const itemCatalogPayload = {
  generatedAt: new Date().toISOString(),
  sourceFile: inputPath,
  totalItems: catalogItems.length,
  items: catalogItems,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
fs.mkdirSync(path.dirname(itemCatalogOutputPath), { recursive: true });
fs.writeFileSync(itemCatalogOutputPath, `${JSON.stringify(itemCatalogPayload, null, 2)}\n`);

console.log(`Catalogo generado en ${outputPath}`);
console.log(`Items exportados: ${rollerItems.length}`);
console.log(`Catalogo general generado en ${itemCatalogOutputPath}`);
console.log(`Items generales exportados: ${catalogItems.length}`);

function asTrimmedString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = Number(value.replace(/,/g, ''));
    return Number.isFinite(normalized) ? normalized : null;
  }

  return null;
}

function toRollerCatalogItem(item) {
  const description = item.description?.trim();

  if (!description) {
    return null;
  }

  const family = inferFamily(description);
  const widthMeters = extractWidthMeters(description);

  if (!family || widthMeters === null || !item.avgCost || item.avgCost <= 0) {
    return null;
  }

  return {
    family,
    openness: inferOpenness(family, description),
    color: inferColor(family, description),
    itemCode: item.itemCode,
    description,
    imageUrl: item.imageUrl,
    widthMeters: Number(widthMeters.toFixed(2)),
    costPerYd2: item.avgCost,
  };
}

function toCatalogItem(item) {
  const suggestedCategory = inferCategory(item.description ?? '');
  const suggestedColor = inferItemColor(item.description ?? '');

  return {
    itemCode: item.itemCode,
    description: item.description ?? '',
    unit: item.unit ?? 'EA',
    avgCost: item.avgCost ?? 0,
    salePrice: item.salePrice,
    imageUrl: item.imageUrl,
    suggestedCategory,
    category: suggestedCategory,
    suggestedColor,
    color: suggestedColor,
    sageItemCode: item.itemCode,
  };
}

function inferCategory(description) {
  const normalized = description.toLowerCase();

  if (
    normalized.includes('screen') ||
    normalized.includes('premium') ||
    normalized.includes('pinpoint') ||
    normalized.includes('pinpointe') ||
    normalized.includes('blackout')
  ) {
    return 'fabric';
  }

  if (normalized.includes('bottomrail') || normalized.includes('bottom rail') || normalized.includes('bottomail')) {
    if (normalized.includes('end cap') || normalized.includes('endcap') || normalized.includes('cap')) {
      return 'bottomCap';
    }
    return 'bottom';
  }

  if (normalized.includes('tube') && !normalized.includes('endplug') && !normalized.includes('end plug')) {
    return 'tube';
  }

  if (
    normalized.includes('chain stopper') ||
    normalized.includes('chain stop') ||
    normalized.includes('chain peanut connector') ||
    normalized.includes('plastic chain connector') ||
    normalized.includes('plast chain connector')
  ) {
    return 'chainStop';
  }

  if (normalized.includes('chain weight') || normalized.includes('cord/chain weight') || normalized.includes('plastic weights')) {
    return 'chainWeight';
  }

  if (normalized.includes('chain')) {
    return 'chain';
  }

  if (normalized.includes('clutch') || normalized.includes('control')) {
    return 'control';
  }

  if (normalized.includes('bracket') || normalized.includes('brakert')) {
    return 'bracket';
  }

  if (normalized.includes('endplug') || normalized.includes('end plug')) {
    return 'endPlug';
  }

  if (normalized.includes('end cap') || normalized.includes('endcap')) {
    return 'bottomCap';
  }

  return 'other';
}

function inferItemColor(description) {
  const normalized = description.toLowerCase();
  const colorPatterns = [
    ['white satin', 'White Satin'],
    ['off white', 'Off White'],
    ['snow flakes', 'Snow Flakes'],
    ['light grey', 'Light Grey'],
    ['light gray', 'Light Gray'],
    ['black satin', 'Black Satin'],
    ['black/black', 'Black/Black'],
    ['char brown', 'Char Brown'],
    ['milk chocolate', 'Milk Chocolate'],
    ['chocolate', 'Chocolate'],
    ['alabaster', 'Alabaster'],
    ['aluminum', 'Aluminum'],
    ['bronze', 'Bronze'],
    ['brown', 'Brown'],
    ['beige', 'Beige'],
    ['bisque', 'Bisque'],
    ['ivory', 'Ivory'],
    ['linen', 'Linen'],
    ['grey', 'Grey'],
    ['gray', 'Gray'],
    ['black', 'Black'],
    ['white', 'White'],
    ['clear', 'Clear'],
    ['zinc', 'Zinc'],
    ['fawn', 'Fawn'],
    ['camel', 'Camel'],
    ['sand', 'Sand'],
    ['taupe', 'Taupe'],
  ];

  return colorPatterns.find(([pattern]) => normalized.includes(pattern))?.[1] ?? null;
}

function inferFamily(description) {
  const normalized = description.toLowerCase();

  if (normalized.includes('pinpoint') || normalized.includes('pinpointe')) {
    return 'Pinpointe';
  }

  if (normalized.includes('premium')) {
    return 'Premium';
  }

  if (normalized.includes('screen')) {
    return 'Screen';
  }

  return null;
}

function inferOpenness(family, description) {
  const normalized = description.toLowerCase();

  if (family === 'Screen') {
    const match = normalized.match(/3000-(\d+)/);

    if (match) {
      return `${match[1]}%`;
    }

    if (normalized.includes('decorative')) {
      return 'Decorative';
    }

    const visionMatch = normalized.match(/calico\s+(\d+)/);

    if (visionMatch) {
      return visionMatch[1];
    }

    return 'Screen';
  }

  if (normalized.includes('blackout')) {
    return 'Blackout';
  }

  return 'Tela';
}

function inferColor(family, description) {
  const withoutWidth = description.replace(/\s+\d+(?:\.\d+)?"\s*$/i, '').trim();
  let normalizedColor = withoutWidth;

  if (family === 'Screen') {
    normalizedColor = withoutWidth
      .replace(/^.*?screen\s+/i, '')
      .replace(/^3000-\d+\s*/i, '')
      .replace(/^decorative\s+/i, '')
      .replace(/^calico\s+\d+\s*/i, '')
      .replace(/^vision\s+/i, '')
      .trim();
  } else if (family === 'Premium') {
    normalizedColor = withoutWidth
      .replace(/^.*?premium(?:\s+plus)?\s*/i, '')
      .replace(/^blackout\s*/i, '')
      .replace(/^fr\s*/i, '')
      .trim();
  } else if (family === 'Pinpointe') {
    normalizedColor = withoutWidth
      .replace(/^.*?pin(?:point|pointe)(?:\s+matte)?\s*/i, '')
      .replace(/^blackout\s*/i, '')
      .replace(/^fr\s*/i, '')
      .trim();
  }

  normalizedColor = normalizedColor
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/^\W+|\W+$/g, '')
    .trim();

  return normalizedColor || 'Sin color';
}

function extractWidthMeters(description) {
  const match = description.match(/(\d+(?:\.\d+)?)"/);

  if (!match) {
    return null;
  }

  const inches = Number(match[1]);

  if (!Number.isFinite(inches)) {
    return null;
  }

  return inches * 0.0254;
}
