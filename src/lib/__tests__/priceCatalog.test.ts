import { describe, expect, it } from 'vitest';
import {
  getRollerFabricColorOptions,
  getRollerFabricVariants,
} from '../priceCatalog';

describe('priceCatalog', () => {
  it('does not expose the invalid Premium Blackout Sin color bindercard option', () => {
    const options = getRollerFabricColorOptions('Premium', 'Blackout');

    expect(options.map((option) => option.color)).not.toContain('Sin color');
    expect(options.map((option) => option.sampleItemCode)).not.toContain('500263B0000');
  });

  it('keeps the real Premium Blackout color options selectable', () => {
    const colors = getRollerFabricColorOptions('Premium', 'Blackout').map(
      (option) => option.color,
    );

    expect(colors).toEqual([
      'Beige',
      'Bisque',
      'Black',
      'Light Grey',
      'Off White',
      'Snow Flakes',
      'Stone Grey',
    ]);
  });

  it('excludes bindercard entries from fabric variants', () => {
    const variants = getRollerFabricVariants('Premium', 'Blackout', 'Sin color');

    expect(variants).toEqual([]);
  });
});
