import { useEffect, useMemo } from 'react';
import { useCalculatorStore } from '../store/useCalculatorStore';
import {
  parseFormValues,
  validateDimensionField,
  buildWastePiecesFromInventory,
  collectUsedWastePieceIds,
  buildWastePiecesFromDraft,
  isSameFabricIdentity,
  applyRollOverrideToResult,
  getFabricCostPerYd2,
  applyFabricCostToResult,
  applyWasteReuseToResult
} from '../utils';
import { DEFAULT_WASTE_REUSE_MARGIN_METERS } from '../../../domain/curtains/constants';
import { calculateScreenMaterials, findReusableWasteMatches } from '../../../domain/curtains/screen';
import {
  getRollerFabricFamilies,
  getRollerFabricOpennessOptions,
  getRollerFabricColorOptions,
  resolveFabricSelection,
  getRollerFabricVariants
} from '../../../lib/priceCatalog';
import { CalculationInput } from '../../../domain/curtains/types';
import { resolveScreenRecipeMaterials } from '../../../lib/recipeResolver';

export function useCalculatorDerivedState() {
  const store = useCalculatorStore();

  const fabricFamilies = useMemo(() => getRollerFabricFamilies(), []);
  const fabricOpennessOptions = useMemo(
    () => getRollerFabricOpennessOptions(store.formValues.fabricFamily),
    [store.formValues.fabricFamily],
  );
  const fabricColorOptions = useMemo(
    () => getRollerFabricColorOptions(store.formValues.fabricFamily, store.formValues.fabricOpenness),
    [store.formValues.fabricFamily, store.formValues.fabricOpenness],
  );

  const parsedFormValues = useMemo(() => parseFormValues(store.formValues), [store.formValues]);

  const inlineFieldErrors = useMemo(
    () => ({
      widthMeters: store.blurredFields.widthMeters
        ? validateDimensionField('widthMeters', store.formValues.widthMeters)
        : undefined,
      heightMeters: store.blurredFields.heightMeters
        ? validateDimensionField('heightMeters', store.formValues.heightMeters)
        : undefined,
    }),
    [store.blurredFields.heightMeters, store.blurredFields.widthMeters, store.formValues.heightMeters, store.formValues.widthMeters],
  );

  const hasValidDimensions = useMemo(
    () =>
      validateDimensionField('widthMeters', store.formValues.widthMeters) === undefined &&
      validateDimensionField('heightMeters', store.formValues.heightMeters) === undefined,
    [store.formValues.heightMeters, store.formValues.widthMeters],
  );

  const rollOptions = useMemo(() => {
    const selectedColor = fabricColorOptions.find(
      (option) => option.color === store.formValues.fabricColor,
    );
    const options =
      selectedColor?.widthsMeters.length
        ? selectedColor.widthsMeters
        : [store.ruleConfig.smallRollMeters, store.ruleConfig.largeRollMeters];

    return [...new Set(options)].sort((left, right) => left - right);
  }, [
    fabricColorOptions,
    store.formValues.fabricColor,
    store.ruleConfig.largeRollMeters,
    store.ruleConfig.smallRollMeters,
  ]);

  const displayErrors = useMemo(
    () => ({
      ...store.errors,
      widthMeters: inlineFieldErrors.widthMeters,
      heightMeters: inlineFieldErrors.heightMeters,
    }),
    [store.errors, inlineFieldErrors.heightMeters, inlineFieldErrors.widthMeters],
  );

  useEffect(() => {
    if (
      !parsedFormValues.curtainType ||
      !parsedFormValues.fabricFamily ||
      !parsedFormValues.fabricOpenness ||
      !parsedFormValues.fabricColor ||
      !hasValidDimensions ||
      parsedFormValues.widthMeters === undefined ||
      parsedFormValues.heightMeters === undefined
    ) {
      store.setResult(null);
      return;
    }

    try {
      store.setResult(calculateScreenMaterials(parsedFormValues as CalculationInput, store.ruleConfig, rollOptions));
      store.setErrors((prev) => ({ ...prev, general: undefined }));
    } catch (error: any) {
      store.setResult(null);
      store.setErrors((prev) => ({ ...prev, general: error.message }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidDimensions, parsedFormValues, store.ruleConfig, rollOptions]);

  const savedWastePieces = useMemo(() => {
    const usedWastePieceIds = collectUsedWastePieceIds(store.orderDraft);
    const fromInventory = buildWastePiecesFromInventory(store.productionInventory).filter(
      (piece) => !usedWastePieceIds.has(piece.id),
    );
    const fromSession = store.sessionWastePieces.filter(
      (piece) => !usedWastePieceIds.has(piece.id),
    );
    return [...fromInventory, ...fromSession];
  }, [store.orderDraft, store.productionInventory, store.sessionWastePieces]);

  const draftWastePieces = useMemo(
    () => buildWastePiecesFromDraft(store.orderDraft),
    [store.orderDraft],
  );

  const wasteMatches = useMemo(() => {
    if (
      !store.result ||
      parsedFormValues.widthMeters === undefined ||
      parsedFormValues.heightMeters === undefined ||
      !parsedFormValues.curtainType
    ) {
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return findReusableWasteMatches(
      parsedFormValues as CalculationInput,
      savedWastePieces,
      DEFAULT_WASTE_REUSE_MARGIN_METERS,
      store.ruleConfig,
      rollOptions
    );
  }, [parsedFormValues, store.result, store.ruleConfig, savedWastePieces, rollOptions]);

  useEffect(() => {
    if (!store.result) {
      store.setSelectedRollWidth(null);
      return;
    }

    if (
      store.selectedRollWidth !== null &&
      store.selectedRollWidth >= store.result.occupiedRollWidthMeters &&
      rollOptions.includes(store.selectedRollWidth)
    ) {
      return;
    }

    store.setSelectedRollWidth(store.result.recommendedRollWidthMeters);
  }, [store.result, rollOptions, store.selectedRollWidth]);

  const selectedFabricPreview = useMemo(() => {
    const occupiedWidth = parsedFormValues.widthMeters ?? 0;

    return resolveFabricSelection(
      store.formValues.fabricFamily,
      store.formValues.fabricOpenness,
      store.formValues.fabricColor,
      occupiedWidth,
      store.selectedRollWidth,
    );
  }, [
    store.formValues,
    parsedFormValues.widthMeters,
    store.selectedRollWidth,
  ]);

  const relatedFabricVariants = useMemo(
    () =>
      getRollerFabricVariants(
        store.formValues.fabricFamily,
        store.formValues.fabricOpenness,
        store.formValues.fabricColor,
      ),
    [store.formValues.fabricColor, store.formValues.fabricFamily, store.formValues.fabricOpenness],
  );

  const colorWastePieces = useMemo(() => {
    if (!selectedFabricPreview) {
      return [];
    }

    return [...savedWastePieces, ...draftWastePieces].filter(
      (piece) => isSameFabricIdentity(piece, selectedFabricPreview),
    );
  }, [draftWastePieces, savedWastePieces, selectedFabricPreview]);

  const colorWasteMatches = useMemo(() => {
    if (!selectedFabricPreview) {
      return [];
    }

    return wasteMatches.filter((match: any) =>
      isSameFabricIdentity(match.wastePiece, selectedFabricPreview),
    );
  }, [selectedFabricPreview, wasteMatches]);

  const selectedWasteMatch =
    colorWasteMatches.find((match: any) => match.wastePiece.id === store.selectedWastePieceId) ?? null;

  const adjustedResult = useMemo(
    () => {
      if (!store.result) {
        return null;
      }

      const rollAdjustedResult = applyRollOverrideToResult(store.result, store.selectedRollWidth);
      const selectedFabric = resolveFabricSelection(
        store.formValues.fabricFamily,
        store.formValues.fabricOpenness,
        store.formValues.fabricColor,
        rollAdjustedResult.occupiedRollWidthMeters,
        rollAdjustedResult.recommendedRollWidthMeters,
      );

      const costAwareResult = applyFabricCostToResult(
        rollAdjustedResult,
        selectedFabric?.costPerYd2 ??
          getFabricCostPerYd2(
            store.productionInventory,
            rollAdjustedResult.recommendedRollWidthMeters,
          ),
      );

      return {
        ...costAwareResult,
        selectedFabric,
      };
    },
    [store.formValues.fabricColor, store.formValues.fabricFamily, store.formValues.fabricOpenness, store.productionInventory, store.result, store.selectedRollWidth],
  );

  const displayResult = useMemo(
    () => (adjustedResult ? applyWasteReuseToResult(adjustedResult, selectedWasteMatch as any) : null),
    [adjustedResult, selectedWasteMatch],
  );

  const recipeResolution = useMemo(() => {
    if (
      !displayResult ||
      !parsedFormValues.curtainType ||
      parsedFormValues.widthMeters === undefined ||
      parsedFormValues.heightMeters === undefined
    ) {
      return null;
    }

    return resolveScreenRecipeMaterials(
      parsedFormValues as CalculationInput,
      displayResult,
      store.screenRecipe,
      store.fabricToneRules,
      store.catalogItems,
    );
  }, [
    displayResult,
    parsedFormValues,
    store.catalogItems,
    store.fabricToneRules,
    store.screenRecipe,
  ]);

  return {
    fabricFamilies,
    fabricOpennessOptions,
    fabricColorOptions,
    parsedFormValues,
    displayErrors,
    hasValidDimensions,
    rollOptions,
    selectedFabricPreview,
    relatedFabricVariants,
    colorWastePieces,
    colorWasteMatches,
    selectedWasteMatch,
    displayResult,
    materialLines: recipeResolution?.materialLines ?? [],
    materialWarnings: recipeResolution?.warnings ?? [],
    toneGroup: recipeResolution?.toneGroup ?? null,
  };
}
