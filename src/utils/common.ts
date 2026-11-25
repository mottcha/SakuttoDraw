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
