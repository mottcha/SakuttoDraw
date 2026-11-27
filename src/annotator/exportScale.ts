import type { BinaryFiles } from '@excalidraw/excalidraw/types';
import type { ExcalidrawImageElement, NonDeletedExcalidrawElement } from '@excalidraw/excalidraw/element/types';

export const AUTO_EXPORT_SCALE_BUDGET = {
  minVectorScale: 2,
  minVectorLongEdgePx: 1200,
  maxVectorScale: 3,
  minTextPx: 24,
  maxTextBoostScale: 3,
  minImageLongEdgePx: 1200,
  maxSmallImageUpscale: 2,
  maxImageScale: 6,
  dominantImageAreaRatio: 0.15,
  maxOutputDimension: 4096,
  maxOutputPixels: 16_777_216,
} as const;

export type ExportScaleBudget = typeof AUTO_EXPORT_SCALE_BUDGET;

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ExportSceneMetrics {
  requiredImageScale: number;
  minTextFontSize: number | null;
}

const DATA_URL_BASE64_RE = /^data:image\/([^;,]+)(?:;[^,]*)*;base64,(.*)$/i;
const MAX_IMAGE_DIM_CACHE_ENTRIES = 256;
const JPEG_MAX_HEADER_B64_CHARS = 87_380; // ~64 KiB, multiple of 4

const imageDimCache = new Map<string, { dataUrlLen: number; dims: ImageDimensions | null }>();

export function clearImageDimensionsCache(): void {
  imageDimCache.clear();
}

function decodeBase64Prefix(b64: string, maxChars: number): Uint8Array | null {
  const usableLen = Math.min(b64.length, maxChars);
  const alignedLen = usableLen - (usableLen % 4);
  if (alignedLen <= 0) return null;
  try {
    const bin = atob(b64.slice(0, alignedLen));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function readUInt16BE(b: Uint8Array, offset: number): number {
  return (b[offset]! << 8) | b[offset + 1]!;
}

function readUInt16LE(b: Uint8Array, offset: number): number {
  return b[offset]! | (b[offset + 1]! << 8);
}

function readUInt24LE(b: Uint8Array, offset: number): number {
  return b[offset]! | (b[offset + 1]! << 8) | (b[offset + 2]! << 16);
}

function readUInt32BE(b: Uint8Array, offset: number): number {
  return ((b[offset]! << 24) | (b[offset + 1]! << 16) | (b[offset + 2]! << 8) | b[offset + 3]!) >>> 0;
}

function readUInt32LE(b: Uint8Array, offset: number): number {
  return (b[offset]! | (b[offset + 1]! << 8) | (b[offset + 2]! << 16) | (b[offset + 3]! << 24)) >>> 0;
}

function parsePngDimensions(b: Uint8Array): ImageDimensions | null {
  if (b.length < 24) return null;
  if (
    b[0] !== 0x89 ||
    b[1] !== 0x50 ||
    b[2] !== 0x4e ||
    b[3] !== 0x47 ||
    b[4] !== 0x0d ||
    b[5] !== 0x0a ||
    b[6] !== 0x1a ||
    b[7] !== 0x0a
  ) {
    return null;
  }
  if (b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) {
    return null;
  }
  const width = readUInt32BE(b, 16);
  const height = readUInt32BE(b, 20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function parseGifDimensions(b: Uint8Array): ImageDimensions | null {
  if (b.length < 10) return null;
  if (
    b[0] !== 0x47 ||
    b[1] !== 0x49 ||
    b[2] !== 0x46 ||
    b[3] !== 0x38 ||
    (b[4] !== 0x37 && b[4] !== 0x39) ||
    b[5] !== 0x61
  ) {
    return null;
  }
  const width = readUInt16LE(b, 6);
  const height = readUInt16LE(b, 8);
  return width > 0 && height > 0 ? { width, height } : null;
}

function parseWebpDimensions(b: Uint8Array): ImageDimensions | null {
  if (b.length < 25) return null;
  if (
    b[0] !== 0x52 ||
    b[1] !== 0x49 ||
    b[2] !== 0x46 ||
    b[3] !== 0x46 ||
    b[8] !== 0x57 ||
    b[9] !== 0x45 ||
    b[10] !== 0x42 ||
    b[11] !== 0x50
  ) {
    return null;
  }
  const c0 = b[12]!;
  const c1 = b[13]!;
  const c2 = b[14]!;
  const c3 = b[15]!;
  // 'VP8X'
  if (c0 === 0x56 && c1 === 0x50 && c2 === 0x38 && c3 === 0x58) {
    if (b.length < 30) return null;
    const width = readUInt24LE(b, 24) + 1;
    const height = readUInt24LE(b, 27) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  // 'VP8L'
  if (c0 === 0x56 && c1 === 0x50 && c2 === 0x38 && c3 === 0x4c) {
    if (b.length < 25 || b[20] !== 0x2f) return null;
    const bits = readUInt32LE(b, 21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  // 'VP8 '
  if (c0 === 0x56 && c1 === 0x50 && c2 === 0x38 && c3 === 0x20) {
    if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) {
      return null;
    }
    const width = readUInt16LE(b, 26) & 0x3fff;
    const height = readUInt16LE(b, 28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return null;
}

function isJpegSofMarker(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function parseJpegDimensions(b: Uint8Array): ImageDimensions | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let pos = 2;
  while (pos < b.length) {
    if (b[pos] !== 0xff) return null;
    while (pos < b.length && b[pos] === 0xff) {
      pos += 1;
    }
    if (pos >= b.length) return null;
    const marker = b[pos]!;
    if (marker === 0x00 || marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 1;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) {
      return null;
    }
    if (pos + 2 >= b.length) return null;
    const segLen = readUInt16BE(b, pos + 1);
    if (segLen < 2) return null;
    if (isJpegSofMarker(marker)) {
      if (segLen < 7 || pos + 7 >= b.length) return null;
      const height = readUInt16BE(b, pos + 4);
      const width = readUInt16BE(b, pos + 6);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    pos += 1 + segLen;
  }
  return null;
}

/**
 * Synchronously extracts natural pixel dimensions from raster image data URLs
 * without async Image decoding so clipboard export preserves user activation.
 */
export function readImageDimensionsFromDataUrl(dataURL: string): ImageDimensions | null {
  if (typeof dataURL !== 'string' || !dataURL) return null;
  const match = DATA_URL_BASE64_RE.exec(dataURL);
  if (!match) return null;
  const subtype = match[1]!.toLowerCase();
  if (subtype === 'svg+xml') return null;
  const b64 = match[2]!;

  if (subtype === 'png') {
    const bytes = decodeBase64Prefix(b64, 48);
    return bytes ? parsePngDimensions(bytes) : null;
  }
  if (subtype === 'gif') {
    const bytes = decodeBase64Prefix(b64, 24);
    return bytes ? parseGifDimensions(bytes) : null;
  }
  if (subtype === 'webp') {
    const bytes = decodeBase64Prefix(b64, 48);
    return bytes ? parseWebpDimensions(bytes) : null;
  }
  if (subtype === 'jpeg' || subtype === 'jpg') {
    const bytes = decodeBase64Prefix(b64, JPEG_MAX_HEADER_B64_CHARS);
    return bytes ? parseJpegDimensions(bytes) : null;
  }

  const probe = decodeBase64Prefix(b64, 48);
  if (!probe) return null;
  return parsePngDimensions(probe) ?? parseWebpDimensions(probe) ?? parseGifDimensions(probe);
}

function getCachedFileDimensions(fileId: string, dataURL: string): ImageDimensions | null {
  const cached = imageDimCache.get(fileId);
  if (cached && cached.dataUrlLen === dataURL.length) {
    return cached.dims;
  }
  const dims = readImageDimensionsFromDataUrl(dataURL);
  if (imageDimCache.size >= MAX_IMAGE_DIM_CACHE_ENTRIES) {
    const oldestKey = imageDimCache.keys().next().value;
    if (oldestKey !== undefined) {
      imageDimCache.delete(oldestKey);
    }
  }
  imageDimCache.set(fileId, { dataUrlLen: dataURL.length, dims });
  return dims;
}

function resolveImageSourceDimensions(
  el: ExcalidrawImageElement,
  files: BinaryFiles,
): ImageDimensions | null {
  if (
    el.crop &&
    typeof el.crop.width === 'number' &&
    typeof el.crop.height === 'number' &&
    el.crop.width > 0 &&
    el.crop.height > 0
  ) {
    return { width: el.crop.width, height: el.crop.height };
  }
  if (!el.fileId) return null;
  const file = files?.[el.fileId];
  if (!file || file.mimeType === 'image/svg+xml' || typeof file.dataURL !== 'string') {
    return null;
  }
  return getCachedFileDimensions(el.fileId, file.dataURL);
}

/**
 * Measures the dominant raster image resolution ratio and minimum text size
 * in the exported elements to keep PNG quality scale-invariant.
 */
export function measureExportSceneMetrics(
  elements: readonly NonDeletedExcalidrawElement[],
  files: BinaryFiles,
  budget: ExportScaleBudget = AUTO_EXPORT_SCALE_BUDGET,
): ExportSceneMetrics {
  const imageEntries: Array<{ ratio: number; area: number }> = [];
  let maxImageArea = 0;
  let minTextFontSize: number | null = null;

  for (const el of elements) {
    if (el.type === 'image') {
      if (!(el.width > 0 && el.height > 0)) continue;
      const srcDims = resolveImageSourceDimensions(el, files);
      if (!srcDims) continue;
      const ratio = Math.max(srcDims.width / el.width, srcDims.height / el.height);
      if (!Number.isFinite(ratio) || ratio <= 0) continue;
      const area = el.width * el.height;
      imageEntries.push({ ratio, area });
      if (area > maxImageArea) {
        maxImageArea = area;
      }
    } else if (el.type === 'text') {
      const fontSize = (el as { fontSize?: unknown }).fontSize;
      if (typeof fontSize === 'number' && Number.isFinite(fontSize) && fontSize > 0) {
        minTextFontSize = minTextFontSize === null ? fontSize : Math.min(minTextFontSize, fontSize);
      }
    }
  }

  let requiredImageScale = 0;
  if (imageEntries.length > 0 && maxImageArea > 0) {
    const areaThreshold = maxImageArea * budget.dominantImageAreaRatio;
    let maxRatio = 0;
    for (const entry of imageEntries) {
      if (entry.area >= areaThreshold && entry.ratio > maxRatio) {
        maxRatio = entry.ratio;
      }
    }
    requiredImageScale = Math.min(budget.maxImageScale, maxRatio);
  }

  return {
    requiredImageScale,
    minTextFontSize,
  };
}

/**
 * Computes a deterministic, scale-invariant PNG export multiplier clamped to
 * safe browser canvas dimension and pixel-area limits.
 */
export function computeAutoExportScale(
  widthAt1x: number,
  heightAt1x: number,
  metrics: ExportSceneMetrics,
  budget: ExportScaleBudget = AUTO_EXPORT_SCALE_BUDGET,
): number {
  if (
    !Number.isFinite(widthAt1x) ||
    !Number.isFinite(heightAt1x) ||
    widthAt1x <= 0 ||
    heightAt1x <= 0
  ) {
    return budget.minVectorScale;
  }

  const longEdge = Math.max(widthAt1x, heightAt1x);
  const textFloor =
    metrics.minTextFontSize && metrics.minTextFontSize > 0
      ? Math.min(budget.maxTextBoostScale, budget.minTextPx / metrics.minTextFontSize)
      : 0;

  let desired: number;
  if (metrics.requiredImageScale > 0) {
    const smallBoost = Math.min(
      metrics.requiredImageScale * budget.maxSmallImageUpscale,
      budget.minImageLongEdgePx / longEdge,
    );
    desired = Math.max(metrics.requiredImageScale, textFloor, smallBoost);
  } else {
    const vectorFloor = Math.min(
      budget.maxVectorScale,
      Math.max(budget.minVectorScale, budget.minVectorLongEdgePx / longEdge),
    );
    desired = Math.max(vectorFloor, textFloor);
  }

  const dimCap = budget.maxOutputDimension / longEdge;
  const areaCap = Math.sqrt(budget.maxOutputPixels / (widthAt1x * heightAt1x));
  const clamped = Math.max(0.25, Math.min(desired, dimCap, areaCap));
  return Math.round(clamped * 1000) / 1000;
}

export function createAutoExportScaleFn(
  elements: readonly NonDeletedExcalidrawElement[],
  files: BinaryFiles,
): (width: number, height: number) => number {
  const metrics = measureExportSceneMetrics(elements, files);
  return (width: number, height: number) => computeAutoExportScale(width, height, metrics);
}
