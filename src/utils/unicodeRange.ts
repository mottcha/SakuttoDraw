const MAX_UNICODE_CP = 0x10ffff;
const FULL_UNICODE_INTERVAL: [number, number] = [0, MAX_UNICODE_CP];

function isValidHex(token: string): boolean {
  return /^[0-9a-f]+$/i.test(token);
}

function mergeIntervals(intervals: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  if (intervals.length === 0) return [];
  const sorted = intervals
    .map(([s, e]): [number, number] => [Math.max(0, s), Math.min(MAX_UNICODE_CP, e)])
    .filter(([s, e]) => s <= e)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length === 0) return [];
  const merged: Array<[number, number]> = [[sorted[0][0], sorted[0][1]]];
  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i];
    const last = merged[merged.length - 1];
    if (start <= last[1] + 1) {
      if (end > last[1]) last[1] = end;
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

function serializeIntervals(intervals: ReadonlyArray<readonly [number, number]>): string {
  return intervals
    .map(([start, end]) =>
      start === end ? `U+${start.toString(16)}` : `U+${start.toString(16)}-${end.toString(16)}`,
    )
    .join(',');
}

/**
 * Parses a CSS `unicode-range` descriptor string into merged inclusive `[start, end]` intervals.
 */
export function parseUnicodeRangeIntervals(unicodeRange: string | undefined): Array<[number, number]> {
  const raw = (unicodeRange || '').trim();
  if (!raw) return [];

  const intervals: Array<[number, number]> = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (!/^U\+/i.test(trimmed)) continue;
    const token = trimmed.slice(2);
    if (!token) continue;
    if (token.includes('-')) {
      const halves = token.split('-');
      if (halves.length !== 2) continue;
      const [startHex, endHex] = halves;
      if (!isValidHex(startHex) || !isValidHex(endHex)) continue;
      const start = parseInt(startHex, 16);
      const end = parseInt(endHex, 16);
      if (start <= end && end <= MAX_UNICODE_CP) {
        intervals.push([start, end]);
      }
    } else if (token.includes('?')) {
      if (!/^[0-9a-f?]+$/i.test(token)) continue;
      const start = parseInt(token.replace(/\?/g, '0'), 16);
      const end = parseInt(token.replace(/\?/g, 'F'), 16);
      if (start <= end && end <= MAX_UNICODE_CP) {
        intervals.push([start, Math.min(MAX_UNICODE_CP, end)]);
      }
    } else {
      if (!isValidHex(token)) continue;
      const cp = parseInt(token, 16);
      if (cp >= 0 && cp <= MAX_UNICODE_CP) {
        intervals.push([cp, cp]);
      }
    }
  }
  return mergeIntervals(intervals);
}

/**
 * Returns `true` if any character in `text` falls within the CSS `unicode-range`.
 */
export function matchesUnicodeRange(unicodeRange: string | undefined, text: string): boolean {
  if (!text) return false;
  const raw = (unicodeRange || '').trim();
  if (!raw) return true;

  const ranges = parseUnicodeRangeIntervals(raw);
  if (ranges.length === 0) return false;

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
 * Converts sorted excluded code points into merged `[start, end]` intervals and subtracts them
 * from `source` in O(K + M) time without expanding huge ranges like `U+0-10FFFF`.
 */
export function subtractUnicodeRange(
  unicodeRange: string | undefined,
  excludeSet: ReadonlySet<number>,
): string | null {
  const raw = (unicodeRange || '').trim();
  const sourceIntervals = raw ? parseUnicodeRangeIntervals(raw) : [FULL_UNICODE_INTERVAL];
  if (sourceIntervals.length === 0) return null;
  if (excludeSet.size === 0) {
    return serializeIntervals(sourceIntervals);
  }

  const excludedSorted = Array.from(excludeSet)
    .filter((cp) => Number.isInteger(cp) && cp >= 0 && cp <= MAX_UNICODE_CP)
    .sort((a, b) => a - b);

  const remaining: Array<[number, number]> = [];
  let exIdx = 0;

  for (const [segStart, segEnd] of sourceIntervals) {
    let cursor = segStart;
    while (exIdx < excludedSorted.length && excludedSorted[exIdx] < cursor) {
      exIdx += 1;
    }
    while (exIdx < excludedSorted.length && excludedSorted[exIdx] <= segEnd) {
      const ex = excludedSorted[exIdx];
      if (ex > cursor) {
        remaining.push([cursor, ex - 1]);
      }
      cursor = ex + 1;
      exIdx += 1;
    }
    if (cursor <= segEnd) {
      remaining.push([cursor, segEnd]);
    }
  }

  if (remaining.length === 0) return null;
  return serializeIntervals(remaining);
}

/**
 * Returns `true` if two CSS `unicode-range` descriptors share at least one code point.
 */
export function rangesIntersect(rangeA: string | undefined, rangeB: string | undefined): boolean {
  const a = parseUnicodeRangeIntervals(rangeA);
  const b = parseUnicodeRangeIntervals(rangeB);
  if (a.length === 0 || b.length === 0) return false;

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const [aStart, aEnd] = a[i];
    const [bStart, bEnd] = b[j];
    if (aStart <= bEnd && bStart <= aEnd) {
      return true;
    }
    if (aEnd < bEnd) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return false;
}
