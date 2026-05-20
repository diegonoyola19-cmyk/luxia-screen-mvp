import { describe, it, expect } from 'vitest';
import { resolveHardwareToneFromFabricColor, extractFabricColorName } from './hardwareToneRules';

describe('extractFabricColorName', () => {
  it('extracts color from Pinpointe strings', () => {
    expect(extractFabricColorName('Pinpointe Blackout e Blackout FR Beige/Bisque 72"')).toBe('Beige/Bisque');
    expect(extractFabricColorName('Pinpointe Blackout e Blackout FR Black/Black 98.43"')).toBe('Black/Black');
    expect(extractFabricColorName('Rollux NEW Pinpointe Blackout FR Smoke 72"')).toBe('Smoke');
    expect(extractFabricColorName('Pinpointe Blackout e Blackout FR Stone Grey 72"')).toBe('Stone Grey');
    expect(extractFabricColorName('e Blackout FR Smoke')).toBe('Smoke');
    expect(extractFabricColorName('e Blackout FR Beige/Bisque')).toBe('Beige/Bisque');
  });

  it('extracts color from object properties in priority order', () => {
    const fabric = {
      description: 'Rollux NEW Pinpointe Blackout FR Beige/Bisque 72"'
    };
    expect(extractFabricColorName(fabric)).toBe('Beige/Bisque');

    const fabric2 = {
      color: 'White/Snow Flakes'
    };
    expect(extractFabricColorName(fabric2)).toBe('White/Snow Flakes');
  });
});

describe('hardwareToneRules', () => {
  it('resolves BEIGE/BISQUE -> ivory', () => {
    expect(resolveHardwareToneFromFabricColor('BEIGE/BISQUE')).toBe('ivory');
    expect(resolveHardwareToneFromFabricColor('Beige/Bisque')).toBe('ivory');
  });

  it('resolves FAWN/OFF WHITE -> ivory', () => {
    expect(resolveHardwareToneFromFabricColor('FAWN/OFF WHITE')).toBe('ivory');
    expect(resolveHardwareToneFromFabricColor('Fawn/Off White')).toBe('ivory');
  });

  it('resolves SMOKE -> grey', () => {
    expect(resolveHardwareToneFromFabricColor('SMOKE')).toBe('grey');
  });

  it('resolves WHITE/SNOW FLAKES -> white', () => {
    expect(resolveHardwareToneFromFabricColor('WHITE/SNOW FLAKES')).toBe('white');
    expect(resolveHardwareToneFromFabricColor('White/Snow Flakes')).toBe('white');
  });

  it('resolves BLACK/BLACK -> bronze', () => {
    expect(resolveHardwareToneFromFabricColor('BLACK/BLACK')).toBe('bronze');
  });

  it('resolves LIGHT GREY/GREY -> grey', () => {
    expect(resolveHardwareToneFromFabricColor('LIGHT GREY/GREY')).toBe('grey');
    expect(resolveHardwareToneFromFabricColor('Light Grey/Grey')).toBe('grey');
  });

  it('resolves STONE/DARK GREY -> grey', () => {
    expect(resolveHardwareToneFromFabricColor('STONE/DARK GREY')).toBe('grey');
    expect(resolveHardwareToneFromFabricColor('Stone/Dark Grey')).toBe('grey');
    expect(resolveHardwareToneFromFabricColor('Stone Grey')).toBe('grey');
    expect(resolveHardwareToneFromFabricColor('Dark Grey')).toBe('grey');
    expect(resolveHardwareToneFromFabricColor('Dark Gray')).toBe('grey');
  });

  it('resolves Brown/Chocolate to bronze', () => {
    expect(resolveHardwareToneFromFabricColor('Brown/Chocolate')).toBe('bronze');
  });

  it('supports mixed case (TAupe -> grey)', () => {
    expect(resolveHardwareToneFromFabricColor('TAupe')).toBe('grey');
  });

  it('supports known typo (Ebony Parl -> grey)', () => {
    expect(resolveHardwareToneFromFabricColor('Ebony Parl')).toBe('grey');
  });

  it('returns null for unknown color', () => {
    expect(resolveHardwareToneFromFabricColor('Unknown Color')).toBeNull();
  });

  it('returns null for conflict', () => {
    expect(resolveHardwareToneFromFabricColor('White/Black')).toBeNull();
  });

  it('returns null for empty or undefined', () => {
    expect(resolveHardwareToneFromFabricColor('')).toBeNull();
    expect(resolveHardwareToneFromFabricColor(undefined)).toBeNull();
    expect(resolveHardwareToneFromFabricColor(null)).toBeNull();
  });
});
