import { describe, expect, it } from 'vitest';
import {
  matchesUnicodeRange,
  parseUnicodeRangeIntervals,
  parseUnicodeRangeToSet,
  rangesIntersect,
  subtractUnicodeRange,
} from '../utils/unicodeRange';

describe('unicodeRange O(K+M) interval arithmetic & matching', () => {
  it('parses single points, ranges, and wildcards while rejecting malformed tokens', () => {
    expect(parseUnicodeRangeIntervals('U+41, U+3040-309F, U+4E??')).toEqual([
      [0x41, 0x41],
      [0x3040, 0x309f],
      [0x4e00, 0x4eff],
    ]);
    expect(parseUnicodeRangeIntervals('U+ZZZZ, U+12-01, U+FFFFFF')).toEqual([]);
  });

  it('computes intersections & subtracts full Unicode ranges including U+0-10FFFF cleanly without Set OOM', () => {
    const full = 'U+0-10FFFF';
    const jpSample = 'U+3040-309F, U+4E00-4E05';
    expect(rangesIntersect(full, jpSample)).toBe(true);
    expect(rangesIntersect('U+0020-007F', 'U+3040-309F')).toBe(false);

    const excludeSet = parseUnicodeRangeToSet(jpSample);
    const diff = subtractUnicodeRange(full, excludeSet);
    expect(diff).toBeTruthy();
    expect(diff!).toContain('U+0-303f');
    expect(diff!).toContain('U+30a0-4dff');
    expect(diff!).toContain('U+4e06-10ffff');
    expect(rangesIntersect(diff!, jpSample)).toBe(false);
    expect(matchesUnicodeRange(diff!, '\u3042')).toBe(false);
    expect(matchesUnicodeRange(diff!, '\u30a2')).toBe(true);
  });

  it('returns null when subtracted set covers entire range', () => {
    expect(subtractUnicodeRange('U+3040-309F', parseUnicodeRangeToSet('U+3000-30FF'))).toBeNull();
  });

  it('returns false on non-empty unparseable unicode-range strings and true only on empty string', () => {
    expect(matchesUnicodeRange('', 'A')).toBe(true);
    expect(matchesUnicodeRange('   ', 'A')).toBe(true);
    expect(matchesUnicodeRange('INVALID_RANGE', 'A')).toBe(false);
    expect(matchesUnicodeRange('U+0041', '')).toBe(false);
  });
});
