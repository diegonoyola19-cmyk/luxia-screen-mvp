import type { HardwareTone } from './types';

export const HARDWARE_TONE_BY_FABRIC_COLOR = {
  white: [
    'white linen',
    'white',
    'snow flakes',
    'off white'
  ],
  grey: [
    'ebony pearl',
    'white pearl',
    'stone grey',
    'light grey',
    'smoke',
    'taupe',
    'grey',
    'gray',
    'dark grey',
    'dark gray'
  ],
  ivory: [
    'linen',
    'beige',
    'bisque',
    'fawn'
  ],
  bronze: [
    'chocolate',
    'ebony',
    'black',
    'brown'
  ]
};

// Known typos, aliases and normalizations
const KNOWN_TYPOS: Record<string, string> = {
  'ebony parl': 'ebony pearl',
  'white pearl': 'white pearl',
  'taupe': 'taupe',
  'gray': 'grey',
  'snow f': 'snow flakes',
  'dark g': 'dark grey',
  'light g': 'light grey',
  'stone': 'stone grey' // If "stone/dark grey" splits to "stone"
};

// Known conflicts that have a specific resolution rule
const KNOWN_CONFLICTS: Record<string, HardwareTone> = {
  'fawn/off white': 'ivory',
  'stone/dark grey': 'grey', // Just in case parts split weirdly, though both are grey now
};

const COMPOUND_SEPARATORS = /[/|]/; // Changed to avoid splitting hyphenated colors if possible, but user said "/", "-", "|", ",". Let's stick to user request:

/**
 * Normalizes a color string by lowercasing, trimming extra spaces,
 * and fixing known typos.
 */
function normalizeColorName(colorName: string): string {
  let normalized = colorName.toLowerCase().replace(/\s+/g, ' ').trim();
  
  if (KNOWN_TYPOS[normalized]) {
    normalized = KNOWN_TYPOS[normalized];
  }

  return normalized;
}

/**
 * Resolves a basic color string (no separators) to a tone.
 */
function resolveSingleColor(colorName: string): HardwareTone | null {
  const normalized = normalizeColorName(colorName);
  for (const [tone, colors] of Object.entries(HARDWARE_TONE_BY_FABRIC_COLOR)) {
    if (colors.includes(normalized)) {
      return tone as HardwareTone;
    }
  }
  return null;
}

/**
 * Resolves the default hardware tone for a given fabric color.
 * Supports compound colors like "Beige/Bisque".
 * Returns null if no match is found or if there's a conflict.
 */
export function resolveHardwareToneFromFabricColor(colorName: string | undefined | null): HardwareTone | null {
  if (!colorName) return null;

  const originalLower = colorName.toLowerCase().replace(/\s+/g, ' ').trim();
  if (KNOWN_CONFLICTS[originalLower]) {
    return KNOWN_CONFLICTS[originalLower];
  }

  // Split by the separators requested by user
  const parts = colorName.split(/[/,\-|]/).map(p => p.trim()).filter(Boolean);
  
  const resolvedTones = new Set<HardwareTone>();
  
  for (const part of parts) {
    const tone = resolveSingleColor(part);
    if (tone) {
      resolvedTones.add(tone);
    }
  }

  if (resolvedTones.size === 1) {
    return Array.from(resolvedTones)[0];
  }

  // If we have parts, and one resolved but others didn't (size 1 logic already handles this if the others returned null)
  // Wait, if resolvedTones.size === 0, return null
  if (resolvedTones.size === 0) {
    return null;
  }

  // If size > 1, it's an unknown conflict
  return null;
}

const PINPOINTE_PREFIXES = [
  'pinpointe blackout e blackout fr',
  'pinpointe blackout fr',
  'pinpointe blackout',
  'pinpointe',
  'e blackout fr'
];

/**
 * Extracts the color name from a raw string, stripping known prefixes and dimensions.
 */
function extractColorFromString(str: string): string | null {
  let lower = str.toLowerCase().replace(/\s+/g, ' ').trim();
  
  for (const prefix of PINPOINTE_PREFIXES) {
    const idx = lower.indexOf(prefix);
    if (idx !== -1) {
      const originalSub = str.substring(idx + prefix.length).trim();
      const noDims = originalSub.replace(/\s+\d+(\.\d+)?["']?$/, '').trim();
      return noDims || null;
    }
  }

  const noDims = str.replace(/\s+\d+(\.\d+)?["']?$/, '').trim();
  return noDims || null;
}

/**
 * Extracts the color name from a fabric object or string.
 */
export function extractFabricColorName(fabric: any): string | null {
  if (!fabric) return null;

  if (typeof fabric === 'string') {
    return extractColorFromString(fabric);
  }

  // Try to find the color in the object properties
  const colorCandidates = [
    fabric.color,
    fabric.variantColor,
    fabric.colorName,
    fabric.variant,
    fabric.colorway,
    fabric.name,
    fabric.description,
    fabric.displayName
  ];

  for (const candidate of colorCandidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      const extracted = extractColorFromString(candidate);
      if (extracted) {
        return extracted;
      }
    }
  }

  return null;
}
