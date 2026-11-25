import {
  CaptureUpdateAction,
  MIME_TYPES,
  applyDarkModeFilter,
  convertToExcalidrawElements,
  exportScene,
  getNonDeletedElements,
} from '@excalidraw/excalidraw';
import type { BinaryFileData, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from '@excalidraw/excalidraw/element/types';
import type { RedactMode, RedactStrength } from '../types/annotator';

export interface SakuttoRedactMeta {
  v: 1;
  mode: RedactMode;
  strength: RedactStrength;
}

export interface RedactRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const REDACT_BLACKOUT_COLOR = '#111111';

export function isRedactElement(el: ExcalidrawElement | null | undefined): boolean {
  if (!el || el.isDeleted) return false;
  const meta = (el as { customData?: { sakuttoRedact?: unknown } }).customData?.sakuttoRedact;
  return Boolean(meta && typeof meta === 'object');
}

export function getRedactMeta(el: ExcalidrawElement | null | undefined): SakuttoRedactMeta | null {
  if (!el) return null;
  const meta = (el as { customData?: { sakuttoRedact?: Partial<SakuttoRedactMeta> } }).customData?.sakuttoRedact;
  if (!meta || typeof meta !== 'object') return null;
  const mode: RedactMode = meta.mode === 'blur' || meta.mode === 'blackout' ? meta.mode : 'mosaic';
  const strength: RedactStrength = meta.strength === 'weak' || meta.strength === 'strong' ? meta.strength : 'medium';
  return { v: 1, mode, strength };
}

export function getMosaicBlockSize(strength: RedactStrength, scale = 1): number {
  const base = strength === 'weak' ? 7 : strength === 'strong' ? 20 : 12;
  return Math.max(2, Math.round(base * Math.max(1, scale)));
}

export function getBlurRadius(strength: RedactStrength, scale = 1): number {
  const base = strength === 'weak' ? 4 : strength === 'strong' ? 16 : 9;
  return Math.max(1, Math.round(base * Math.max(1, scale)));
}

/**
 * Pure-JS block-averaging RGBA pixelation (zero subpixel drift, strict CSP safe).
 */
export function applyMosaicToImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  blockSize: number,
): void {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  const bs = Math.max(1, Math.floor(blockSize));
  if (w === 0 || h === 0 || bs <= 1) return;

  for (let by = 0; by < h; by += bs) {
    const yEnd = Math.min(by + bs, h);
    for (let bx = 0; bx < w; bx += bs) {
      const xEnd = Math.min(bx + bs, w);
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      let count = 0;

      for (let y = by; y < yEnd; y++) {
        let idx = (y * w + bx) * 4;
        for (let x = bx; x < xEnd; x++) {
          rSum += data[idx];
          gSum += data[idx + 1];
          bSum += data[idx + 2];
          aSum += data[idx + 3];
          count += 1;
          idx += 4;
        }
      }

      if (count === 0) continue;
      const rAvg = Math.round(rSum / count);
      const gAvg = Math.round(gSum / count);
      const bAvg = Math.round(bSum / count);
      const aAvg = Math.round(aSum / count);

      for (let y = by; y < yEnd; y++) {
        let idx = (y * w + bx) * 4;
        for (let x = bx; x < xEnd; x++) {
          data[idx] = rAvg;
          data[idx + 1] = gAvg;
          data[idx + 2] = bAvg;
          data[idx + 3] = aAvg;
          idx += 4;
        }
      }
    }
  }
}

function boxBlurHorizontal(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  r: number,
): void {
  const win = r * 2 + 1;
  const maxX = w - 1;
  for (let y = 0; y < h; y++) {
    const rowOffset = y * w * 4;
    let rAcc = 0;
    let gAcc = 0;
    let bAcc = 0;
    let aAcc = 0;

    for (let k = -r; k <= r; k++) {
      const sx = k < 0 ? 0 : k > maxX ? maxX : k;
      const idx = rowOffset + sx * 4;
      rAcc += src[idx];
      gAcc += src[idx + 1];
      bAcc += src[idx + 2];
      aAcc += src[idx + 3];
    }

    for (let x = 0; x < w; x++) {
      const outIdx = rowOffset + x * 4;
      dst[outIdx] = Math.round(rAcc / win);
      dst[outIdx + 1] = Math.round(gAcc / win);
      dst[outIdx + 2] = Math.round(bAcc / win);
      dst[outIdx + 3] = Math.round(aAcc / win);

      const remX = x - r;
      const addX = x + r + 1;
      const remClamped = remX < 0 ? 0 : remX > maxX ? maxX : remX;
      const addClamped = addX < 0 ? 0 : addX > maxX ? maxX : addX;
      const remIdx = rowOffset + remClamped * 4;
      const addIdx = rowOffset + addClamped * 4;

      rAcc += src[addIdx] - src[remIdx];
      gAcc += src[addIdx + 1] - src[remIdx + 1];
      bAcc += src[addIdx + 2] - src[remIdx + 2];
      aAcc += src[addIdx + 3] - src[remIdx + 3];
    }
  }
}

function boxBlurVertical(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  r: number,
): void {
  const win = r * 2 + 1;
  const maxY = h - 1;
  const stride = w * 4;
  for (let x = 0; x < w; x++) {
    const colOffset = x * 4;
    let rAcc = 0;
    let gAcc = 0;
    let bAcc = 0;
    let aAcc = 0;

    for (let k = -r; k <= r; k++) {
      const sy = k < 0 ? 0 : k > maxY ? maxY : k;
      const idx = sy * stride + colOffset;
      rAcc += src[idx];
      gAcc += src[idx + 1];
      bAcc += src[idx + 2];
      aAcc += src[idx + 3];
    }

    for (let y = 0; y < h; y++) {
      const outIdx = y * stride + colOffset;
      dst[outIdx] = Math.round(rAcc / win);
      dst[outIdx + 1] = Math.round(gAcc / win);
      dst[outIdx + 2] = Math.round(bAcc / win);
      dst[outIdx + 3] = Math.round(aAcc / win);

      const remY = y - r;
      const addY = y + r + 1;
      const remClamped = remY < 0 ? 0 : remY > maxY ? maxY : remY;
      const addClamped = addY < 0 ? 0 : addY > maxY ? maxY : addY;
      const remIdx = remClamped * stride + colOffset;
      const addIdx = addClamped * stride + colOffset;

      rAcc += src[addIdx] - src[remIdx];
      gAcc += src[addIdx + 1] - src[remIdx + 1];
      bAcc += src[addIdx + 2] - src[remIdx + 2];
      aAcc += src[addIdx + 3] - src[remIdx + 3];
    }
  }
}

/**
 * Pure-JS 3-pass separable sliding-window box blur with edge clamping.
 * Avoids Safari ctx.filter issues, border halos, and WASM/eval under strict CSP.
 */
export function applyGaussianBlurToImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): void {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  const r = Math.max(0, Math.floor(radius));
  if (w === 0 || h === 0 || r === 0) return;

  const boxR = Math.max(1, Math.round(r * 0.52));
  const tmp = new Uint8ClampedArray(data.length);
  for (let pass = 0; pass < 3; pass++) {
    boxBlurHorizontal(data, tmp, w, h, boxR);
    boxBlurVertical(tmp, data, w, h, boxR);
  }
}

function nextNonce(): number {
  return Math.floor(Math.random() * 2147483647) + 1;
}

function makeRedactId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function buildRedactedPatchFile(
  api: ExcalidrawImperativeAPI,
  rect: RedactRect,
  mode: 'mosaic' | 'blur',
  strength: RedactStrength,
  excludeFromIndex: number,
): Promise<{ fileData: BinaryFileData } | null> {
  if (typeof document === 'undefined') return null;

  const appState = api.getAppState();
  const files = api.getFiles();
  const nonDeleted = getNonDeletedElements(api.getSceneElements());
  const belowElements = excludeFromIndex >= 0 ? nonDeleted.slice(0, excludeFromIndex) : nonDeleted;

  const captureScale = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const padScene = mode === 'blur' ? Math.min(48, Math.ceil(getBlurRadius(strength, 1) * 2.5)) : 0;
  const captureX = rect.x - padScene;
  const captureY = rect.y - padScene;
  const captureW = Math.max(1, rect.width + padScene * 2);
  const captureH = Math.max(1, rect.height + padScene * 2);
  const canvasBg = appState.viewBackgroundColor || '#ffffff';

  let renderedCanvas: HTMLCanvasElement;
  if (belowElements.length === 0) {
    renderedCanvas = document.createElement('canvas');
    renderedCanvas.width = Math.max(1, Math.round(captureW * captureScale));
    renderedCanvas.height = Math.max(1, Math.round(captureH * captureScale));
    const fillCtx = renderedCanvas.getContext('2d');
    if (fillCtx) {
      fillCtx.fillStyle = appState.theme === 'dark' ? applyDarkModeFilter(canvasBg) : canvasBg;
      fillCtx.fillRect(0, 0, renderedCanvas.width, renderedCanvas.height);
    }
  } else {
    renderedCanvas = await exportScene({
      type: 'canvas',
      data: {
        elements: belowElements,
        appState: {
          viewBackgroundColor: canvasBg,
          gridModeEnabled: false,
        },
        files,
      },
      config: {
        x: captureX,
        y: captureY,
        width: captureW,
        height: captureH,
        origin: 'canvas',
        fit: 'none',
        padding: 0,
        canvasBackgroundColor: canvasBg,
        theme: appState.theme,
        scale: captureScale,
      },
    });
  }

  const renderedCtx = renderedCanvas.getContext('2d');
  if (!renderedCtx || renderedCanvas.width === 0 || renderedCanvas.height === 0) return null;

  const imgData = renderedCtx.getImageData(0, 0, renderedCanvas.width, renderedCanvas.height);
  if (mode === 'mosaic') {
    applyMosaicToImageData(
      imgData.data,
      renderedCanvas.width,
      renderedCanvas.height,
      getMosaicBlockSize(strength, captureScale),
    );
  } else {
    applyGaussianBlurToImageData(
      imgData.data,
      renderedCanvas.width,
      renderedCanvas.height,
      getBlurRadius(strength, captureScale),
    );
  }
  renderedCtx.putImageData(imgData, 0, 0);

  const outCanvas = document.createElement('canvas');
  const targetW = Math.max(1, Math.round(rect.width * captureScale));
  const targetH = Math.max(1, Math.round(rect.height * captureScale));
  outCanvas.width = targetW;
  outCanvas.height = targetH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return null;

  const padPx = Math.round(padScene * captureScale);
  outCtx.drawImage(
    renderedCanvas,
    padPx,
    padPx,
    Math.max(1, renderedCanvas.width - padPx * 2),
    Math.max(1, renderedCanvas.height - padPx * 2),
    0,
    0,
    targetW,
    targetH,
  );

  const dataURL = outCanvas.toDataURL('image/png') as BinaryFileData['dataURL'];
  const fileId = makeRedactId('redact_file') as BinaryFileData['id'];
  const fileData: BinaryFileData = {
    id: fileId,
    mimeType: MIME_TYPES.png,
    dataURL,
    created: Date.now(),
  };

  return { fileData };
}

function buildBlackoutElement(rect: RedactRect, strength: RedactStrength): OrderedExcalidrawElement {
  const [created] = convertToExcalidrawElements([
    {
      type: 'rectangle',
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      strokeColor: 'transparent',
      backgroundColor: REDACT_BLACKOUT_COLOR,
      fillStyle: 'solid',
      strokeWidth: 1,
      roughness: 0,
      opacity: 100,
      roundness: null,
      customData: {
        sakuttoRedact: { v: 1, mode: 'blackout', strength } satisfies SakuttoRedactMeta,
      },
    },
  ]);
  return created;
}

function buildRedactImageElement(
  rect: RedactRect,
  fileId: BinaryFileData['id'],
  mode: 'mosaic' | 'blur',
  strength: RedactStrength,
): OrderedExcalidrawElement {
  const [created] = convertToExcalidrawElements([
    {
      type: 'image',
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      fileId,
      status: 'saved',
      scale: [1, 1],
      crop: null,
      roundness: null,
      customData: {
        sakuttoRedact: { v: 1, mode, strength } satisfies SakuttoRedactMeta,
      },
    },
  ]);
  return created;
}

export async function createOrUpdateRedactElement({
  api,
  rect,
  mode,
  strength,
  existingElementId,
  selectResult = true,
}: {
  api: ExcalidrawImperativeAPI | null;
  rect: RedactRect;
  mode: RedactMode;
  strength: RedactStrength;
  existingElementId?: string;
  selectResult?: boolean;
}): Promise<ExcalidrawElement | null> {
  if (!api) return null;
  const safeRect: RedactRect = {
    x: rect.x,
    y: rect.y,
    width: Math.max(4, rect.width),
    height: Math.max(4, rect.height),
  };

  const allElements: OrderedExcalidrawElement[] = [...api.getSceneElements()];
  const nonDeleted = getNonDeletedElements(allElements);
  const existingIdx = existingElementId
    ? allElements.findIndex((el) => el.id === existingElementId && !el.isDeleted)
    : -1;
  const nonDeletedIdx = existingElementId
    ? nonDeleted.findIndex((el) => el.id === existingElementId)
    : -1;
  const existingEl = existingIdx >= 0 ? allElements[existingIdx] : null;

  let nextEl: OrderedExcalidrawElement;
  const nextMeta: SakuttoRedactMeta = { v: 1, mode, strength };

  if (mode === 'blackout') {
    if (existingEl && existingEl.type === 'rectangle') {
      nextEl = {
        ...existingEl,
        x: safeRect.x,
        y: safeRect.y,
        width: safeRect.width,
        height: safeRect.height,
        strokeColor: 'transparent',
        backgroundColor: REDACT_BLACKOUT_COLOR,
        fillStyle: 'solid',
        roughness: 0,
        roundness: null,
        version: existingEl.version + 1,
        versionNonce: nextNonce(),
        updated: Date.now(),
        customData: { ...existingEl.customData, sakuttoRedact: nextMeta },
      };
    } else {
      const fresh = buildBlackoutElement(safeRect, strength);
      nextEl = existingEl
        ? { ...fresh, index: existingEl.index }
        : fresh;
    }
  } else {
    const patch = await buildRedactedPatchFile(api, safeRect, mode, strength, nonDeletedIdx);
    if (!patch) return null;
    api.addFiles([patch.fileData]);

    if (existingEl && existingEl.type === 'image') {
      nextEl = {
        ...existingEl,
        x: safeRect.x,
        y: safeRect.y,
        width: safeRect.width,
        height: safeRect.height,
        fileId: patch.fileData.id,
        status: 'saved',
        scale: [1, 1],
        crop: null,
        roundness: null,
        version: existingEl.version + 1,
        versionNonce: nextNonce(),
        updated: Date.now(),
        customData: { ...existingEl.customData, sakuttoRedact: nextMeta },
      };
    } else {
      const fresh = buildRedactImageElement(safeRect, patch.fileData.id, mode, strength);
      nextEl = existingEl
        ? { ...fresh, index: existingEl.index }
        : fresh;
    }
  }

  if (existingIdx >= 0) {
    allElements[existingIdx] = nextEl;
  } else {
    allElements.push(nextEl);
  }

  const appStateUpdate = selectResult
    ? { selectedElementIds: { [nextEl.id]: true as const } }
    : undefined;

  api.updateScene({
    elements: allElements,
    ...(appStateUpdate ? { appState: appStateUpdate } : {}),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  return nextEl;
}
