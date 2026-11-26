import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cjkFontManifest } from '../annotator/cjkFontManager';
import { jpFontManifest } from '../annotator/jpGlyphOverride';

const ROOT_DIR = path.resolve(__dirname, '..', '..');

describe('sync-excalidraw-assets generated manifests', () => {
  it('keeps cjkFontManifest non-empty across all 6 packs with deduplicated URLs and valid paths', () => {
    const sets = cjkFontManifest.sets;
    for (const key of ['ja', 'jaStandard', 'jaPop', 'jaCode', 'ko', 'zh'] as const) {
      const pack = sets[key];
      expect(pack.files.length).toBeGreaterThan(0);
      expect(pack.totalBytes).toBeGreaterThan(0);
      expect(new Set(pack.files).size).toBe(pack.files.length);
      for (const rel of pack.files) {
        expect(fs.existsSync(path.join(ROOT_DIR, 'public', rel)), `Missing public asset: ${rel}`).toBe(true);
      }
    }
  });

  it('keeps compacted jpFontManifest ranges table unique and all rangeIndex entries in bounds', () => {
    const ranges = jpFontManifest.ranges ?? [];
    expect(ranges.length).toBeGreaterThan(0);
    expect(new Set(ranges).size).toBe(ranges.length);

    const checkChunks = (
      chunks: ReadonlyArray<{ file: string; rangeIndex?: number }> | undefined,
      label: string,
    ) => {
      expect(chunks && chunks.length > 0, `${label} chunks missing`).toBe(true);
      for (const chunk of chunks ?? []) {
        expect(chunk.rangeIndex).toBeTypeOf('number');
        expect(chunk.rangeIndex!).toBeGreaterThanOrEqual(0);
        expect(chunk.rangeIndex!).toBeLessThan(ranges.length);
        expect(fs.existsSync(path.join(ROOT_DIR, 'public', chunk.file)), `Missing chunk file: ${chunk.file}`).toBe(true);
      }
    };

    checkChunks(jpFontManifest.chunks, 'SetoJP');
    checkChunks(jpFontManifest.bizUdpGothic?.chunks, 'BizUdpGothic');
    checkChunks(jpFontManifest.mochiyPop?.chunks, 'MochiyPop');
    checkChunks(jpFontManifest.sakuttoCode?.chunks, 'SakuttoCode');
    checkChunks(jpFontManifest.comicShannsMono500?.chunks, 'ComicShannsMono500');

    expect(jpFontManifest.cascadiaCodeRangeIndex).toBeTypeOf('number');
    expect(jpFontManifest.cascadiaCodeRangeIndex!).toBeGreaterThanOrEqual(0);
    expect(jpFontManifest.cascadiaCodeRangeIndex!).toBeLessThan(ranges.length);
    expect(Boolean(jpFontManifest.cascadiaMono?.file)).toBe(true);
    expect(fs.existsSync(path.join(ROOT_DIR, 'public', jpFontManifest.cascadiaMono!.file))).toBe(true);
  });
});
