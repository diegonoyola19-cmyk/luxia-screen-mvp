import { DEFAULT_SCREEN_RULE_CONFIG } from './constants';
import type {
  CalculationInput,
  CalculationResult,
  ScreenFixedComponent,
  ScreenRuleConfig,
  ScreenRuleConfigErrors,
  ScreenValidationErrors,
  WastePiece,
  WasteReuseMatch,
} from './types';

const FEET_PER_METER = 3.28084;
const YARD2_PER_M2 = 1.19599;
const LINEAR_DISCOUNT_METERS = 0.03;

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
  } else if (input.widthMeters > config.maxWidthMeters) {
    errors.widthMeters =
      `El ancho maximo permitido para Screen es ${config.maxWidthMeters.toFixed(2)} m.`;
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
  occupiedRollWidthMeters: number;
}

function buildCalculationOption(
  input: CalculationInput,
  config: ScreenRuleConfig,
): ScreenCalculationOption {
  return {
    orientationUsed: 'normal',
    recommendedRollWidthMeters: getRecommendedRollWidth(input.widthMeters, config),
    cutLengthMeters: input.heightMeters + config.cutHeightExtraMeters,
    occupiedRollWidthMeters: input.widthMeters,
  };
}

function pickBestOption(
  input: CalculationInput,
  config: ScreenRuleConfig,
): ScreenCalculationOption {
  const options = getCalculationOptions(input, config);

  if (options.length === 0) {
    throw new Error('No hay una orientacion valida para estas medidas.');
  }

  return options.reduce((best, current) => {
    const bestDownloadedArea =
      best.recommendedRollWidthMeters * best.cutLengthMeters;
    const currentDownloadedArea =
      current.recommendedRollWidthMeters * current.cutLengthMeters;

    if (currentDownloadedArea < bestDownloadedArea) {
      return current;
    }

    if (
      currentDownloadedArea === bestDownloadedArea &&
      current.orientationUsed === 'normal'
    ) {
      return current;
    }

    return best;
  });
}

function getCalculationOptions(
  input: CalculationInput,
  config: ScreenRuleConfig,
): ScreenCalculationOption[] {
  return [buildCalculationOption(input, config)];
}

export function getRecommendedRollWidth(
  widthMeters: number,
  config: ScreenRuleConfig = DEFAULT_SCREEN_RULE_CONFIG,
): number {
  if (widthMeters <= config.smallRollMeters) {
    return config.smallRollMeters;
  }

  if (widthMeters <= config.largeRollMeters) {
    return config.largeRollMeters;
  }

  throw new Error('El ancho excede el rollo maximo permitido para Screen.');
}

export function calculateScreenMaterials(
  input: CalculationInput,
  config: ScreenRuleConfig = DEFAULT_SCREEN_RULE_CONFIG,
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

  const selectedOption = pickBestOption(input, config);
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

  return {
    curtainType: input.curtainType,
    selectedFabric: null,
    orientationUsed: selectedOption.orientationUsed,
    recommendedRollWidthMeters: selectedOption.recommendedRollWidthMeters,
    cutLengthMeters: selectedOption.cutLengthMeters,
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
  };
}

export function findReusableWasteMatches(
  input: CalculationInput,
  wastePieces: WastePiece[],
  marginMeters: number,
  config: ScreenRuleConfig = DEFAULT_SCREEN_RULE_CONFIG,
): WasteReuseMatch[] {
  const options = getCalculationOptions(input, config);

  return wastePieces
    .map((wastePiece) => {
      const match = options.find(
        (option) =>
          (wastePiece.widthMeters >= option.occupiedRollWidthMeters &&
            wastePiece.heightMeters >= option.cutLengthMeters) ||
          (wastePiece.heightMeters >= option.occupiedRollWidthMeters &&
            wastePiece.widthMeters >= option.cutLengthMeters) ||
          (wastePiece.widthMeters >= option.occupiedRollWidthMeters &&
            wastePiece.heightMeters >= option.cutLengthMeters + marginMeters) ||
          (wastePiece.heightMeters >= option.occupiedRollWidthMeters &&
            wastePiece.widthMeters >= option.cutLengthMeters + marginMeters),
      );

      if (!match) {
        return null;
      }

      return {
        wastePiece,
        orientationUsed: match.orientationUsed,
        requiredWidthMeters: match.occupiedRollWidthMeters,
        requiredHeightMeters: match.cutLengthMeters,
        marginMeters,
      };
    })
    .filter((match): match is WasteReuseMatch => match !== null)
    .sort((left, right) => left.wastePiece.areaM2 - right.wastePiece.areaM2);
}
