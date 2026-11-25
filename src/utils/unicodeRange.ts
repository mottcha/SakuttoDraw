/**
 * Parses a CSS `unicode-range` descriptor string into inclusive `[start, end]` code point intervals.
 */
export function parseUnicodeRangeIntervals(unicodeRange: string | undefined): Array<[number, number]> {
  const raw = (unicodeRange || '').trim();
  if (!raw) return [];

  const intervals: Array<[number, number]> = [];
  for (const part of raw.split(',')) {
    const token = part.trim().replace(/^U\+/i, '');
    if (!token) continue;
    if (token.includes('-')) {
      const [startHex, endHex] = token.split('-');
      const start = parseInt(startHex, 16);
      const end = parseInt(endHex, 16);
      if (!Number.isNaN(start) && !Number.isNaN(end) && start <= end) {
        intervals.push([start, end]);
      }
    } else if (token.includes('?')) {
      const start = parseInt(token.replace(/\?/g, '0'), 16);
      const end = parseInt(token.replace(/\?/g, 'F'), 16);
      if (!Number.isNaN(start) && !Number.isNaN(end) && start <= end) {
        intervals.push([start, end]);
      }
    } else {
      const cp = parseInt(token, 16);
      if (!Number.isNaN(cp)) {
        intervals.push([cp, cp]);
      }
    }
  }
  return intervals;
}

/**
 * Returns `true` if any character in `text` falls within the CSS `unicode-range`.
 */
export function matchesUnicodeRange(unicodeRange: string | undefined, text: string): boolean {
  if (!text) return false;
  const raw = (unicodeRange || '').trim();
  if (!raw || raw.toUpperCase() === 'U+0-10FFFF') return true;

  const ranges = parseUnicodeRangeIntervals(raw);
  if (ranges.length === 0) return true;

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    for (const [start, end] of ranges) {
      if (cp >= start && cp <= end) return true;
    }
  }
  return false;
}

/**
 * Expands a CSS `unicode-range` descriptor string into a `Set` of individual code points.
 */
export function parseUnicodeRangeToSet(unicodeRange: string | undefined): Set<number> {
  const result = new Set<number>();
  for (const [start, end] of parseUnicodeRangeIntervals(unicodeRange)) {
    for (let cp = start; cp <= end; cp++) {
      result.add(cp);
    }
  }
  return result;
}

/**
 * Serializes a collection of Unicode code points into a compact CSS `unicode-range` string.
 */
export function serializeCodePointsToUnicodeRange(codePoints: Iterable<number>): string {
  const sorted = Array.from(new Set(codePoints)).sort((a, b) => a - b);
  if (sorted.length === 0) return '';

  const tokens: string[] = [];
  let runStart = sorted[0];
  let runEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const cp = sorted[i];
    if (cp === runEnd + 1) {
      runEnd = cp;
    } else {
      tokens.push(
        runStart === runEnd
          ? `U+${runStart.toString(16)}`
          : `U+${runStart.toString(16)}-${runEnd.toString(16)}`,
      );
      runStart = cp;
      runEnd = cp;
    }
  }
  tokens.push(
    runStart === runEnd
      ? `U+${runStart.toString(16)}`
      : `U+${runStart.toString(16)}-${runEnd.toString(16)}`,
  );
  return tokens.join(',');
}

/**
 * Subtracts `excludeSet` from `unicodeRange` and returns the remaining CSS `unicode-range`,
 * or `null` if no code points remain.
 */
export function subtractUnicodeRange(
  unicodeRange: string | undefined,
  excludeSet: ReadonlySet<number>,
): string | null {
  const raw = (unicodeRange || '').trim();
  if (!raw || raw.toUpperCase() === 'U+0-10FFFF') {
    return raw || 'U+0-10FFFF';
  }
  const source = parseUnicodeRangeToSet(raw);
  if (source.size === 0) return null;

  const remaining: number[] = [];
  for (const cp of source) {
    if (!excludeSet.has(cp)) {
      remaining.push(cp);
    }
  }
  if (remaining.length === 0) return null;
  return serializeCodePointsToUnicodeRange(remaining);
}

/**
 * Returns `true` if two CSS `unicode-range` descriptors share at least one code point.
 */
export function rangesIntersect(rangeA: string | undefined, rangeB: string | undefined): boolean {
  const setA = parseUnicodeRangeToSet(rangeA);
  if (setA.size === 0) return false;
  const setB = parseUnicodeRangeToSet(rangeB);
  for (const cp of setA) {
    if (setB.has(cp)) return true;
  }
  return false;
}
