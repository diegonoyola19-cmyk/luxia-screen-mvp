import { 
  DEFAULT_SCREEN_RULE_CONFIG, 
  FEET_PER_METER, 
  YARD2_PER_M2
} from './constants';
import type {
  CalculationInput,
  CalculationResult,
  ScreenFixedComponent,
  ScreenRuleConfig,
  ScreenRuleConfigErrors,
  ScreenValidationErrors,
  WastePiece,
  WasteReuseMatch,
  ProductionBatchItem,
  BatchCalculationResult,
} from './types';

const LINEAR_DISCOUNT_METERS = 0.03;
const MAX_TUBE_WIDTH = 5.79;
const REINFORCED_TUBE_THRESHOLD = 3.0;

export function validateScreenInput(
  input: Partial<CalculationInput>,
  config: ScreenRuleConfig = DEFAULT_SCREEN_RULE_CONFIG,
): ScreenValidationErrors {
  const errors: ScreenValidationErrors = {};

  if (!input.curtainType) {
    errors.curtainType = 'Selecciona un tipo de cortina.';
  }

  if (!input.fabricFamily || input.fabricFamily.trim() === '') {
    errors.fabricFamily = 'Selecciona la linea de tela.';
  }

  if (!input.fabricOpenness || input.fabricOpenness.trim() === '') {
    errors.fabricOpenness = 'Selecciona la apertura de tela.';
  }

  if (!input.fabricColor || input.fabricColor.trim() === '') {
    errors.fabricColor = 'Selecciona el color de tela.';
  }

  if (input.widthMeters === undefined || Number.isNaN(input.widthMeters)) {
    errors.widthMeters = 'Ingresa el ancho terminado en metros.';
  } else if (input.widthMeters <= 0) {
    errors.widthMeters = 'El ancho debe ser mayor que cero.';
  } else if (input.widthMeters > MAX_TUBE_WIDTH) {
    errors.widthMeters = `Excede el ancho maximo de tubo (19 ft / ${MAX_TUBE_WIDTH} m).`;
  }

  if (input.heightMeters === undefined || Number.isNaN(input.heightMeters)) {
    errors.heightMeters = 'Ingresa el alto terminado en metros.';
  } else if (input.heightMeters <= 0) {
    errors.heightMeters = 'El alto debe ser mayor que cero.';
  }

  return errors;
}

export function validateScreenRuleConfig(
  config: Partial<ScreenRuleConfig>,
): ScreenRuleConfigErrors {
  const errors: ScreenRuleConfigErrors = {};

  if (config.cutHeightExtraMeters === undefined || Number.isNaN(config.cutHeightExtraMeters)) {
    errors.cutHeightExtraMeters = 'Ingresa el extra de alto de corte.';
  } else if (config.cutHeightExtraMeters < 0) {
    errors.cutHeightExtraMeters = 'El extra de alto no puede ser negativo.';
  }

  if (config.maxWidthMeters === undefined || Number.isNaN(config.maxWidthMeters)) {
    errors.maxWidthMeters = 'Ingresa el ancho maximo permitido.';
  } else if (config.maxWidthMeters <= 0) {
    errors.maxWidthMeters = 'El ancho maximo debe ser mayor que cero.';
  }

  if (config.chainMultiplier === undefined || Number.isNaN(config.chainMultiplier)) {
    errors.chainMultiplier = 'Ingresa el multiplicador de cadena.';
  } else if (config.chainMultiplier <= 0) {
    errors.chainMultiplier = 'El multiplicador de cadena debe ser mayor que cero.';
  }

  if (config.smallRollMeters === undefined || Number.isNaN(config.smallRollMeters)) {
    errors.smallRollMeters = 'Ingresa el rollo pequeno.';
  } else if (config.smallRollMeters <= 0) {
    errors.smallRollMeters = 'El rollo pequeno debe ser mayor que cero.';
  }

  if (config.largeRollMeters === undefined || Number.isNaN(config.largeRollMeters)) {
    errors.largeRollMeters = 'Ingresa el rollo grande.';
  } else if (config.largeRollMeters <= 0) {
    errors.largeRollMeters = 'El rollo grande debe ser mayor que cero.';
  }

  if (
    config.smallRollMeters !== undefined &&
    config.largeRollMeters !== undefined &&
    !Number.isNaN(config.smallRollMeters) &&
    !Number.isNaN(config.largeRollMeters) &&
    config.largeRollMeters < config.smallRollMeters
  ) {
    errors.largeRollMeters = 'El rollo grande debe ser igual o mayor que el pequeno.';
  }

  if (
    config.maxWidthMeters !== undefined &&
    config.largeRollMeters !== undefined &&
    !Number.isNaN(config.maxWidthMeters) &&
    !Number.isNaN(config.largeRollMeters) &&
    config.maxWidthMeters > config.largeRollMeters
  ) {
    errors.maxWidthMeters =
      'El ancho maximo no puede superar el rollo grande disponible.';
  }

  if (!config.fixedComponents || config.fixedComponents.length === 0) {
    errors.fixedComponents = 'Agrega al menos un componente fijo.';
  } else {
    const hasInvalidComponent = config.fixedComponents.some(
      (component) =>
        !component ||
        Number.isNaN(component.quantity) ||
        component.quantity <= 0 ||
        component.name.trim() === '' ||
        component.unit.trim() === '' ||
        Number.isNaN(component.cost) ||
        component.cost < 0,
    );

    if (hasInvalidComponent) {
      errors.fixedComponents =
        'Cada componente fijo debe tener cantidad, unidad, nombre y costo validos.';
    }
  }

  return errors;
}

function formatFixedComponent(component: ScreenFixedComponent) {
  return component;
}

interface ScreenCalculationOption {
  orientationUsed: 'normal' | 'volteada';
  recommendedRollWidthMeters: number;
  cutLengthMeters: number;
  cutWidthMeters: number;
  occupiedRollWidthMeters: number;
}

function buildCalculationOption(
  input: CalculationInput,
  config: ScreenRuleConfig,
  availableWidths: number[],
  orientation: 'normal' | 'volteada'
): ScreenCalculationOption {
  if (orientation === 'normal') {
    const cutWidthMeters = input.widthMeters + 0.10;
    return {
      orientationUsed: 'normal',
      recommendedRollWidthMeters: selectRollo(cutWidthMeters, availableWidths),
      cutLengthMeters: input.heightMeters + config.cutHeightExtraMeters + 0.10,
      cutWidthMeters,
      occupiedRollWidthMeters: cutWidthMeters,
    };
  } else {
    // Volteada: El alto (con extra) se acomoda al ancho del rollo
    const cutWidthMeters = input.heightMeters + config.cutHeightExtraMeters + 0.10;
    return {
      orientationUsed: 'volteada',
      recommendedRollWidthMeters: selectRollo(cutWidthMeters, availableWidths),
      cutLengthMeters: input.widthMeters + 0.10,
      cutWidthMeters,
      occupiedRollWidthMeters: cutWidthMeters,
    };
  }
}

function pickBestOption(
  input: CalculationInput,
  config: ScreenRuleConfig,
  availableWidths: number[]
): ScreenCalculationOption {
  const options = getCalculationOptions(input, config, availableWidths);

  if (options.length === 0) {
    throw new Error('No hay una orientacion valida para estas medidas.');
  }

  const normalOption = options.find(o => o.orientationUsed === 'normal');
  const volteadaOption = options.find(o => o.orientationUsed === 'volteada');

  // Si ambas son validas
  if (normalOption && volteadaOption) {
    // 1. Si Volteada permite un rollo mas pequeño, es mas eficiente en costo
    if (volteadaOption.recommendedRollWidthMeters < normalOption.recommendedRollWidthMeters) {
      return volteadaOption;
    }
    
    // 2. Si usan el mismo rollo (o Normal usa uno menor, raro pero posible), 
    // preferimos siempre Normal por el hilo de la tela.
    return normalOption;
  }

  // Si solo hay una valida, retornar esa
  return options[0];
}

function getCalculationOptions(
  input: CalculationInput,
  config: ScreenRuleConfig,
  availableWidths: number[]
): ScreenCalculationOption[] {
  const options: ScreenCalculationOption[] = [];

  // Intenta Normal
  try {
    options.push(buildCalculationOption(input, config, availableWidths, 'normal'));
  } catch {
    // No cabe normal
  }

  // Intenta Volteada
  try {
    options.push(buildCalculationOption(input, config, availableWidths, 'volteada'));
  } catch {
    // No cabe volteada
  }

  return options;
}

export function selectRollo(
  cutWidthMeters: number,
  availableWidths: number[]
): number {
  const valid = availableWidths
    .filter((w) => w >= cutWidthMeters)
    .sort((a, b) => a - b);

  if (valid.length === 0) {
    throw new Error('No hay rollo disponible para este ancho con la tela seleccionada');
  }

  return valid[0];
}

export function calculateBatchMaterials(
  items: ProductionBatchItem[],
  config: ScreenRuleConfig = DEFAULT_SCREEN_RULE_CONFIG,
  availableWidths: number[] = [2.5, 3.0]
): BatchCalculationResult {
  if (items.length === 0) {
    throw new Error('Batch vacio');
  }

  let totalCutWidthMeters = 0;
  let maxCutLengthMeters = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const cutWidth = item.input.widthMeters + 0.10; // Encuadre base
    const cutLength = item.input.heightMeters + config.cutHeightExtraMeters + 0.10; // Encuadre base

    totalCutWidthMeters += cutWidth;
    if (i > 0) {
      totalCutWidthMeters += 0.05; // 5 cm de separacion entre piezas
    }

    if (cutLength > maxCutLengthMeters) {
      maxCutLengthMeters = cutLength;
    }
  }

  let recommendedRollWidthMeters = 0;
  let error: string | undefined;

  try {
    recommendedRollWidthMeters = selectRollo(totalCutWidthMeters, availableWidths);
  } catch {
    error = 'Ancho excedido para esta tela';
  }

  const fabricDownloadedM2 = recommendedRollWidthMeters * maxCutLengthMeters;
  const fabricUsefulM2 = totalCutWidthMeters * maxCutLengthMeters;
  const wasteM2 = fabricDownloadedM2 - fabricUsefulM2;

  const fabricDownloadedYd2 = fabricDownloadedM2 * YARD2_PER_M2;
  const wasteYd2 = wasteM2 * YARD2_PER_M2;

  return {
    fabricFamily: items[0].input.fabricFamily,
    fabricColor: items[0].input.fabricColor,
    items,
    totalCutWidthMeters,
    maxCutLengthMeters,
    recommendedRollWidthMeters,
    fabricDownloadedYd2,
    wasteYd2,
    error
  };
}

export function calculateScreenMaterials(
  input: CalculationInput,
  config: ScreenRuleConfig = DEFAULT_SCREEN_RULE_CONFIG,
  availableWidths: number[] = [2.5, 3.0]
): CalculationResult {
  const validationErrors = validateScreenInput(input, config);

  if (Object.keys(validationErrors).length > 0) {
    const firstErrorMessage =
      validationErrors.widthMeters ??
      validationErrors.heightMeters ??
      validationErrors.curtainType ??
      validationErrors.general ??
      'La entrada no es valida.';

    throw new Error(firstErrorMessage);
  }

  const selectedOption = pickBestOption(input, config, availableWidths);
  const wasteWidthMeters =
    selectedOption.recommendedRollWidthMeters - selectedOption.occupiedRollWidthMeters;
  const tubeMeters = Math.max(input.widthMeters - LINEAR_DISCOUNT_METERS, 0);
  const bottomRailMeters = Math.max(input.widthMeters - LINEAR_DISCOUNT_METERS, 0);
  const chainMeters = input.heightMeters * config.chainMultiplier;

  const fabricDownloadedM2 =
    selectedOption.recommendedRollWidthMeters * selectedOption.cutLengthMeters;
  const fabricUsefulM2 =
    selectedOption.occupiedRollWidthMeters * selectedOption.cutLengthMeters;
  const wasteM2 = fabricDownloadedM2 - fabricUsefulM2;

  const requiresReinforcedTube = input.widthMeters > REINFORCED_TUBE_THRESHOLD;
  const tubeRecommendation = requiresReinforcedTube 
    ? "Requiere tubo reforzado. Producción debe definir si corresponde tubo de 45 mm o 63 mm." 
    : undefined;

  return {
    curtainType: input.curtainType,
    selectedFabric: null,
    orientationUsed: selectedOption.orientationUsed,
    recommendedRollWidthMeters: selectedOption.recommendedRollWidthMeters,
    cutLengthMeters: selectedOption.cutLengthMeters,
    cutWidthMeters: selectedOption.cutWidthMeters,
    occupiedRollWidthMeters: selectedOption.occupiedRollWidthMeters,
    wasteWidthMeters,
    wastePieceWidthMeters: wasteWidthMeters,
    wastePieceHeightMeters: selectedOption.cutLengthMeters,
    tubeMeters,
    bottomRailMeters,
    chainMeters,
    tubeFeet: tubeMeters * FEET_PER_METER,
    bottomRailFeet: bottomRailMeters * FEET_PER_METER,
    chainFeet: chainMeters * FEET_PER_METER,
    fabricDownloadedM2,
    fabricUsefulM2,
    wasteM2,
    fabricDownloadedYd2: fabricDownloadedM2 * YARD2_PER_M2,
    fabricUsefulYd2: fabricUsefulM2 * YARD2_PER_M2,
    wasteYd2: wasteM2 * YARD2_PER_M2,
    wastePercentage:
      fabricDownloadedM2 === 0 ? 0 : (wasteM2 / fabricDownloadedM2) * 100,
    fabricCostPerYd2: 0,
    fabricDownloadedCost: 0,
    fabricUsefulCost: 0,
    fabricWasteCost: 0,
    fabricSavingsCost: 0,
    fixedComponents: config.fixedComponents.map(formatFixedComponent),
    requiresReinforcedTube,
    tubeRecommendation,
  };
}

export function findReusableWasteMatches(
  input: CalculationInput,
  wastePieces: WastePiece[],
  marginMeters: number,
  config: ScreenRuleConfig = DEFAULT_SCREEN_RULE_CONFIG,
  availableWidths: number[] = [2.5, 3.0]
): WasteReuseMatch[] {
  let selectedOption: ScreenCalculationOption;

  try {
    selectedOption = pickBestOption(input, config, availableWidths);
  } catch {
    return [];
  }

  return wastePieces
    .map((wastePiece) => {
      if (
        wastePiece.widthMeters < selectedOption.occupiedRollWidthMeters ||
        wastePiece.heightMeters < selectedOption.cutLengthMeters
      ) {
        return null;
      }

      return {
        wastePiece,
        orientationUsed: selectedOption.orientationUsed,
        requiredWidthMeters: selectedOption.occupiedRollWidthMeters,
        requiredHeightMeters: selectedOption.cutLengthMeters,
        marginMeters,
      };
    })
    .filter((match): match is WasteReuseMatch => match !== null)
    .sort((left, right) => left.wastePiece.areaM2 - right.wastePiece.areaM2);
}

export function calcularDescargoRetazo(requerido: number, retazo: number) {
  const alcanza = retazo >= requerido;
  const merma = alcanza ? retazo - requerido : 0;
  const descargar = alcanza ? retazo : 0;
  return { alcanza, merma, descargar };
}
