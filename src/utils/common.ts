/**
 * Executes a callback and returns `undefined` if it throws.
 */
export function silently<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/**
 * Normalizes a CSS `#rgb` or `#rrggbb` hex color string, returning `fallback` otherwise.
 */
export function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed) || /^#[0-9a-f]{3}$/.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

/**
 * Classifies very light or very dark hex colors so low-contrast swatches receive
 * an Excalidraw-style 1px outline only in matching light or dark themes.
 */
export function getSwatchToneClass(hex: string): 'exq-swatch--light' | 'exq-swatch--dark' | '' {
  const normalized = normalizeHexColor(hex, '');
  if (!normalized) return '';
  const expanded =
    normalized.length === 4
      ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
      : normalized;
  const toLinear = (byte: number): number => {
    const c = byte / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = toLinear(parseInt(expanded.slice(1, 3), 16));
  const g = toLinear(parseInt(expanded.slice(3, 5), 16));
  const b = toLinear(parseInt(expanded.slice(5, 7), 16));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum >= 0.85) return 'exq-swatch--light';
  if (lum <= 0.04) return 'exq-swatch--dark';
  return '';
}

/**
 * Generates a positive 31-bit random versionNonce (`>= 1`) compatible with Excalidraw elements.
 */
export function nextElementNonce(): number {
  return Math.floor(Math.random() * 2147483647) + 1;
}

/**
 * Generates a compact unique Excalidraw element ID.
 */
export function makeElementId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  }
  return `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Returns `true` when running on an Apple platform (macOS / iOS / iPadOS).
 */
export function isMacPlatform(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '')
  );
}
