import { FONT_FAMILY, Fonts } from '@excalidraw/excalidraw';

export const XIAOLAI_FALLBACK_FAMILY_ID = 100;
export const XIAOLAI_FAMILY_NAME = 'Xiaolai';

export type RegisteredFontsMap = typeof Fonts.registered;
export type RegisteredFontEntry = RegisteredFontsMap extends Map<number, infer V> ? V : never;
export type ExcalidrawFontFaceLike = RegisteredFontEntry['fontFaces'][number];

/**
 * Safely returns Excalidraw's global `Fonts.registered` registry when `FontFace` is available.
 */
export function getDefaultRegisteredFonts(): RegisteredFontsMap | null {
  if (typeof FontFace === 'undefined') {
    return null;
  }
  try {
    return Fonts.registered;
  } catch {
    return null;
  }
}

/**
 * Finds the font-family numeric ID for `Xiaolai` in a `Fonts.registered` map.
 */
export function findXiaolaiFamilyId(registeredFonts: RegisteredFontsMap): number | null {
  if (registeredFonts.has(XIAOLAI_FALLBACK_FAMILY_ID)) {
    return XIAOLAI_FALLBACK_FAMILY_ID;
  }
  for (const [id, entry] of registeredFonts.entries()) {
    const fam = entry.fontFaces[0]?.fontFace?.family;
    if (fam === XIAOLAI_FAMILY_NAME || fam === `"${XIAOLAI_FAMILY_NAME}"`) {
      return id;
    }
  }
  return null;
}

/**
 * Clears deprecated flag from Excalidraw's built-in `Cascadia` entry (ID 3)
 * so it appears cleanly in FontPicker without an "OLD" badge.
 */
export function enableCascadiaFontInRegistry(
  registeredFonts: RegisteredFontsMap | null = getDefaultRegisteredFonts(),
): boolean {
  if (!registeredFonts) return false;
  const entry = registeredFonts.get(FONT_FAMILY.Cascadia);
  if (!entry) return false;
  if (entry.metadata?.deprecated) {
    const { deprecated: _deprecated, ...rest } = entry.metadata;
    entry.metadata = rest;
  }
  return true;
}

/**
 * Purges cached entries for the specified font-family names from Excalidraw's
 * internal `Fonts.loadedFontsCache` so swapped faces load immediately on next draw/export.
 */
export function clearLoadedFontCacheForFamilies(familyNames: readonly string[]): void {
  const cache = (Fonts as unknown as { loadedFontsCache?: Set<string> }).loadedFontsCache;
  if (!cache || typeof cache.forEach !== 'function' || familyNames.length === 0) return;
  for (const sig of Array.from(cache)) {
    if (
      familyNames.some(
        (name) => sig.startsWith(`${name}-`) || sig.startsWith(`"${name}"-`),
      )
    ) {
      cache.delete(sig);
    }
  }
}
