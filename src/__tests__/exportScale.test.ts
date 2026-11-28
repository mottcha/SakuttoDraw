import { afterEach, describe, expect, it } from 'vitest';
import type { BinaryFiles } from '@excalidraw/excalidraw/types';
import type { NonDeletedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import {
  clearImageDimensionsCache,
  computeAutoExportScale,
  createAutoExportScaleFn,
  measureExportSceneMetrics,
  readImageDimensionsFromDataUrl,
} from '../annotator/exportScale';

function toBase64DataUrl(mime: string, bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

function makePngDataUrl(width: number, height: number): string {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  b[16] = (width >>> 24) & 0xff;
  b[17] = (width >>> 16) & 0xff;
  b[18] = (width >>> 8) & 0xff;
  b[19] = width & 0xff;
  b[20] = (height >>> 24) & 0xff;
  b[21] = (height >>> 16) & 0xff;
  b[22] = (height >>> 8) & 0xff;
  b[23] = height & 0xff;
  return toBase64DataUrl('image/png', b);
}

function makeGifDataUrl(width: number, height: number): string {
  const b = new Uint8Array(10);
  b.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // GIF89a
  b[6] = width & 0xff;
  b[7] = (width >> 8) & 0xff;
  b[8] = height & 0xff;
  b[9] = (height >> 8) & 0xff;
  return toBase64DataUrl('image/gif', b);
}

function makeJpegDataUrl(width: number, height: number): string {
  // SOI + APP0(len=6) + SOF0(len=11, 8-bit, H, W, 3 components)
  const b = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00,
  ]);
  return toBase64DataUrl('image/jpeg', b);
}

function makeWebpVp8xDataUrl(width: number, height: number): string {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  b.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
  const w = width - 1;
  const h = height - 1;
  b[24] = w & 0xff;
  b[25] = (w >> 8) & 0xff;
  b[26] = (w >> 16) & 0xff;
  b[27] = h & 0xff;
  b[28] = (h >> 8) & 0xff;
  b[29] = (h >> 16) & 0xff;
  return toBase64DataUrl('image/webp', b);
}

function makeWebpVp8lDataUrl(width: number, height: number): string {
  const b = new Uint8Array(25);
  b.set([0x52, 0x49, 0x46, 0x46], 0);
  b.set([0x57, 0x45, 0x42, 0x50], 8);
  b.set([0x56, 0x50, 0x38, 0x4c], 12); // VP8L
  b[20] = 0x2f;
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  b[21] = bits & 0xff;
  b[22] = (bits >>> 8) & 0xff;
  b[23] = (bits >>> 16) & 0xff;
  b[24] = (bits >>> 24) & 0xff;
  return toBase64DataUrl('image/webp', b);
}

function makeWebpVp8DataUrl(width: number, height: number): string {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46], 0);
  b.set([0x57, 0x45, 0x42, 0x50], 8);
  b.set([0x56, 0x50, 0x38, 0x20], 12); // VP8
  b[23] = 0x9d;
  b[24] = 0x01;
  b[25] = 0x2a;
  b[26] = width & 0xff;
  b[27] = (width >> 8) & 0x3f;
  b[28] = height & 0xff;
  b[29] = (height >> 8) & 0x3f;
  return toBase64DataUrl('image/webp', b);
}

function imgEl(
  id: string,
  fileId: string,
  width: number,
  height: number,
  crop: { x: number; y: number; width: number; height: number; naturalWidth: number; naturalHeight: number } | null = null,
): NonDeletedExcalidrawElement {
  return { id, type: 'image', fileId, width, height, crop, isDeleted: false } as unknown as NonDeletedExcalidrawElement;
}

function textEl(id: string, fontSize: number): NonDeletedExcalidrawElement {
  return { id, type: 'text', fontSize, isDeleted: false } as unknown as NonDeletedExcalidrawElement;
}

describe('exportScale: synchronous binary dimension parsing & scale-invariant quality', () => {
  afterEach(() => {
    clearImageDimensionsCache();
  });

  it('synchronously parses PNG, JPEG, GIF, and WebP (VP8/VP8L/VP8X) headers and ignores SVG/invalid data', () => {
    expect(readImageDimensionsFromDataUrl(makePngDataUrl(2880, 1800))).toEqual({ width: 2880, height: 1800 });
    expect(readImageDimensionsFromDataUrl(makeJpegDataUrl(1920, 1080))).toEqual({ width: 1920, height: 1080 });
    expect(readImageDimensionsFromDataUrl(makeGifDataUrl(640, 480))).toEqual({ width: 640, height: 480 });
    expect(readImageDimensionsFromDataUrl(makeWebpVp8xDataUrl(2560, 1440))).toEqual({ width: 2560, height: 1440 });
    expect(readImageDimensionsFromDataUrl(makeWebpVp8lDataUrl(1280, 720))).toEqual({ width: 1280, height: 720 });
    expect(readImageDimensionsFromDataUrl(makeWebpVp8DataUrl(800, 600))).toEqual({ width: 800, height: 600 });

    expect(readImageDimensionsFromDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBeNull();
    expect(readImageDimensionsFromDataUrl('data:image/png;base64,not-valid-base64!!!')).toBeNull();
    expect(readImageDimensionsFromDataUrl(`data:image/png;${';'.repeat(5000)}`)).toBeNull();
    expect(readImageDimensionsFromDataUrl('')).toBeNull();
  });

  it('produces scale-invariant output across shrunk+S, 1:1+L, and enlarged+XL screenshots while protecting tiny text', () => {
    const files = {
      f1440: { id: 'f1440', mimeType: 'image/png', dataURL: makePngDataUrl(1440, 810), created: 1 },
      f2880: { id: 'f2880', mimeType: 'image/png', dataURL: makePngDataUrl(2880, 1800), created: 1 },
      f400: { id: 'f400', mimeType: 'image/png', dataURL: makePngDataUrl(400, 225), created: 1 },
    } as unknown as BinaryFiles;

    // 1440x810 shrunk to 480x270 + S(16) -> scale 3 -> 1440x810
    const shrunkScale = createAutoExportScaleFn([imgEl('i1', 'f1440', 480, 270), textEl('t1', 16)], files)(480, 270);
    expect(shrunkScale).toBe(3);
    expect(Math.round(480 * shrunkScale)).toBe(1440);

    // 1440x810 at 1:1 + L(28) -> scale 1 -> 1440x810
    const oneToOneScale = createAutoExportScaleFn([imgEl('i1', 'f1440', 1440, 810), textEl('t1', 28)], files)(1440, 810);
    expect(oneToOneScale).toBe(1);

    // 1440x810 enlarged to 2160x1215 + XL(36) -> scale 0.667 -> ~1440x810
    const enlargedXlScale = createAutoExportScaleFn([imgEl('i1', 'f1440', 2160, 1215), textEl('t1', 36)], files)(2160, 1215);
    expect(enlargedXlScale).toBeCloseTo(0.667, 3);
    expect(Math.round(2160 * enlargedXlScale)).toBe(1441);

    // 1440x810 enlarged to 2160x1215 + S(16) -> text floor protects 24px -> scale 1.5
    const enlargedSmallTextScale = createAutoExportScaleFn([imgEl('i1', 'f1440', 2160, 1215), textEl('t1', 16)], files)(2160, 1215);
    expect(enlargedSmallTextScale).toBe(1.5);

    // 2880x1800 Retina pasted/shrunk to 720x450 -> scale 4 -> 2880x1800
    const retinaScale = createAutoExportScaleFn([imgEl('i2', 'f2880', 720, 450)], files)(720, 450);
    expect(retinaScale).toBe(4);

    // Small 400x225 screenshot shrunk 200x112.5 + S(16) vs enlarged 800x450 + XL(36) -> both converge to 800x450
    const smallShrunkScale = createAutoExportScaleFn([imgEl('i3', 'f400', 200, 112.5), textEl('t1', 16)], files)(200, 112.5);
    const smallEnlargedScale = createAutoExportScaleFn([imgEl('i3', 'f400', 800, 450), textEl('t1', 36)], files)(800, 450);
    expect(smallShrunkScale).toBe(4);
    expect(smallEnlargedScale).toBe(1);
    expect(Math.round(200 * smallShrunkScale)).toBe(800);
    expect(Math.round(800 * smallEnlargedScale)).toBe(800);
  });

  it('uses crop dimensions when present and ignores tiny non-dominant corner icons', () => {
    const files = {
      big: { id: 'big', mimeType: 'image/png', dataURL: makePngDataUrl(1200, 800), created: 1 },
      icon: { id: 'icon', mimeType: 'image/png', dataURL: makePngDataUrl(512, 512), created: 1 },
    } as unknown as BinaryFiles;

    // Cropped region 600x400 placed at 300x200 -> 2x
    const croppedMetrics = measureExportSceneMetrics(
      [
        imgEl('c1', 'big', 300, 200, {
          x: 0,
          y: 0,
          width: 600,
          height: 400,
          naturalWidth: 1200,
          naturalHeight: 800,
        }),
      ],
      files,
    );
    expect(croppedMetrics.requiredImageScale).toBe(2);

    // Tiny 32x32 corner icon (< 15% of 1200*800) with 512x512 source (16x ratio) must not inflate scene scale
    const mixedMetrics = measureExportSceneMetrics(
      [imgEl('main', 'big', 1200, 800), imgEl('badge', 'icon', 32, 32)],
      files,
    );
    expect(mixedMetrics.requiredImageScale).toBe(1);
  });

  it('guarantees at least 2x (up to 3x for tiny diagrams) for vector scenes and clamps huge canvases safely', () => {
    expect(computeAutoExportScale(1000, 700, { requiredImageScale: 0, minTextFontSize: 20 })).toBe(2);
    expect(computeAutoExportScale(300, 180, { requiredImageScale: 0, minTextFontSize: 20 })).toBe(3);

    // Huge 4000x3000 canvas: areaCap = sqrt(16777216/12000000) ~ 1.182, dimCap = 12288/4000 = 3.072
    const clamped = computeAutoExportScale(4000, 3000, { requiredImageScale: 0, minTextFontSize: null });
    expect(clamped).toBe(1.182);
    expect(4000 * clamped).toBeLessThanOrEqual(12288);
    expect(4000 * clamped * (3000 * clamped)).toBeLessThanOrEqual(16_777_216);

    // Extreme narrow strip (400x25000 = 10M px <= 16.77M px) is still safely capped by maxOutputDimension (12288)
    const stripScale = computeAutoExportScale(400, 25000, { requiredImageScale: 1, minTextFontSize: null });
    expect(stripScale).toBe(0.491);
    expect(Math.floor(25000 * stripScale)).toBeLessThanOrEqual(12288);

    // Even when desired <= cap (e.g. 0.4915 <= 0.49152), Math.round must never push output above maxOutputDimension
    const nearCapScale = computeAutoExportScale(400, 25000, {
      requiredImageScale: 0.4915,
      minTextFontSize: null,
    });
    expect(nearCapScale).toBe(0.491);
    expect(25000 * nearCapScale).toBeLessThanOrEqual(12288);
  });

  it('preserves full-page tall screenshot resolution within pixel-area budget while capping normal thumbnails', () => {
    const files = {
      tall: { id: 'tall', mimeType: 'image/png', dataURL: makePngDataUrl(1440, 8000), created: 1 },
      wide: { id: 'wide', mimeType: 'image/png', dataURL: makePngDataUrl(8000, 1440), created: 1 },
      ultraTall: { id: 'ultraTall', mimeType: 'image/png', dataURL: makePngDataUrl(1440, 14000), created: 1 },
      nearElongated: { id: 'nearElongated', mimeType: 'image/png', dataURL: makePngDataUrl(2490, 1000), created: 1 },
      exactElongated: { id: 'exactElongated', mimeType: 'image/png', dataURL: makePngDataUrl(2500, 1000), created: 1 },
      photo: { id: 'photo', mimeType: 'image/png', dataURL: makePngDataUrl(4000, 3000), created: 1 },
    } as unknown as BinaryFiles;

    // 1440x8000 (11.52M px <= 16.77M px) placed at 90x500 by Excalidraw (16x ratio, aspect 5.56 >= 2.5) -> full 1440x8000
    const tallScale = createAutoExportScaleFn([imgEl('t1', 'tall', 90, 500)], files)(90, 500);
    expect(tallScale).toBe(16);
    expect(Math.round(90 * tallScale)).toBe(1440);
    expect(Math.round(500 * tallScale)).toBe(8000);

    // Wide panorama (8000x1440, aspect 5.56 >= 2.5) gets the same 16x allowance
    const wideScale = createAutoExportScaleFn([imgEl('w1', 'wide', 500, 90)], files)(500, 90);
    expect(wideScale).toBe(16);

    // 1440x14000 (20.16M px > 16.77M px) placed at 1440x14000 -> clamped by maxOutputDimension (12288) & area budget
    const ultraScale = createAutoExportScaleFn([imgEl('t2', 'ultraTall', 1440, 14000)], files)(1440, 14000);
    expect(Math.round(14000 * ultraScale)).toBeLessThanOrEqual(12288);
    expect(1440 * ultraScale * (14000 * ultraScale)).toBeLessThanOrEqual(16_777_216);
    expect(Math.round(1440 * ultraScale)).toBeGreaterThanOrEqual(1200);

    // Boundary around elongatedAspectRatio (2.5): 2.49 caps at 6x, 2.5 allows up to 16x
    expect(measureExportSceneMetrics([imgEl('e1', 'nearElongated', 124.5, 50)], files).requiredImageScale).toBe(6);
    expect(measureExportSceneMetrics([imgEl('e2', 'exactElongated', 125, 50)], files).requiredImageScale).toBe(16);

    // Normal 4000x3000 photo intentionally shrunk to 200x150 thumbnail (aspect 1.33 < 2.5) stays capped at 6x
    const thumbMetrics = measureExportSceneMetrics([imgEl('p1', 'photo', 200, 150)], files);
    expect(thumbMetrics.requiredImageScale).toBe(6);
  });
});
