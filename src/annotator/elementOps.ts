import { CaptureUpdateAction, getNonDeletedElements } from '@excalidraw/excalidraw';
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from '@excalidraw/excalidraw/element/types';
import { makeElementId, nextElementNonce } from '../utils/common';

/**
 * Expands the current selection (direct element IDs + selected group IDs)
 * to a fixed point including bound text and frame children.
 */
export function expandSelectedElementIds(
  allElements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  { includeLocked }: { includeLocked: boolean },
): Set<string> {
  const selectedIds = appState.selectedElementIds ?? {};
  const selectedGroupIds = appState.selectedGroupIds ?? {};
  const targetIds = new Set<string>();

  for (const el of allElements) {
    if (el.isDeleted || (!includeLocked && el.locked)) continue;
    if (
      selectedIds[el.id] ||
      (Array.isArray(el.groupIds) && el.groupIds.some((gid) => Boolean(selectedGroupIds[gid])))
    ) {
      targetIds.add(el.id);
    }
  }

  if (targetIds.size === 0) return targetIds;

  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const el of allElements) {
      if (el.isDeleted || targetIds.has(el.id)) continue;
      const containerId = (el as { containerId?: string | null }).containerId;
      if (containerId && targetIds.has(containerId)) {
        targetIds.add(el.id);
        expanded = true;
        continue;
      }
      if ((includeLocked || !el.locked) && el.frameId && targetIds.has(el.frameId)) {
        targetIds.add(el.id);
        expanded = true;
      }
    }
  }

  return targetIds;
}

export function filterTargetElementsForExport(
  allElements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  onlySelected: boolean,
): {
  elements: NonDeletedExcalidrawElement[];
  exportedOnlySelected: boolean;
} {
  const nonDeleted = getNonDeletedElements(allElements);
  if (!onlySelected) {
    return { elements: [...nonDeleted], exportedOnlySelected: false };
  }

  const includedIds = expandSelectedElementIds(nonDeleted, appState, { includeLocked: true });
  if (includedIds.size === 0) {
    return { elements: [...nonDeleted], exportedOnlySelected: false };
  }

  const filtered = nonDeleted.filter((el) => includedIds.has(el.id));
  if (filtered.length === 0) {
    return { elements: [...nonDeleted], exportedOnlySelected: false };
  }

  return { elements: filtered, exportedOnlySelected: true };
}

/**
 * Deletes the currently selected elements via ExcalidrawImperativeAPI so mobile
 * action buttons work reliably regardless of DOM focus or keyboard handling.
 */
export function deleteSelectedElementsWithApi(api: ExcalidrawImperativeAPI | null): boolean {
  if (!api) return false;
  const appState = api.getAppState();
  if (!appState || appState.viewModeEnabled) return false;

  const allElements =
    typeof api.getSceneElementsIncludingDeleted === 'function'
      ? api.getSceneElementsIncludingDeleted()
      : api.getSceneElements();
  const idsToDelete = expandSelectedElementIds(allElements, appState, { includeLocked: false });
  if (idsToDelete.size === 0) return false;

  const now = Date.now();
  const nextElements = allElements.map((el) => {
    if (idsToDelete.has(el.id)) {
      return {
        ...el,
        isDeleted: true,
        version: el.version + 1,
        versionNonce: nextElementNonce(),
        updated: now,
      };
    }

    let changed = false;
    let nextBound = el.boundElements;
    if (Array.isArray(el.boundElements) && el.boundElements.some((b) => idsToDelete.has(b.id))) {
      const filtered = el.boundElements.filter((b) => !idsToDelete.has(b.id));
      nextBound = filtered.length > 0 ? filtered : null;
      changed = true;
    }

    const linear = el as ExcalidrawElement & {
      startBinding?: { elementId: string } | null;
      endBinding?: { elementId: string } | null;
    };
    let nextStartBinding = linear.startBinding;
    let nextEndBinding = linear.endBinding;
    if (linear.startBinding && idsToDelete.has(linear.startBinding.elementId)) {
      nextStartBinding = null;
      changed = true;
    }
    if (linear.endBinding && idsToDelete.has(linear.endBinding.elementId)) {
      nextEndBinding = null;
      changed = true;
    }

    if (!changed) return el;
    return {
      ...el,
      boundElements: nextBound,
      ...(nextStartBinding !== linear.startBinding ? { startBinding: nextStartBinding } : {}),
      ...(nextEndBinding !== linear.endBinding ? { endBinding: nextEndBinding } : {}),
      version: el.version + 1,
      versionNonce: nextElementNonce(),
      updated: now,
    } as ExcalidrawElement;
  });

  api.updateScene({
    elements: nextElements as OrderedExcalidrawElement[],
    appState: {
      selectedElementIds: {},
      selectedGroupIds: {},
      editingGroupId: null,
      selectedLinearElement: null,
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return true;
}

/**
 * Duplicates the currently selected elements via ExcalidrawImperativeAPI,
 * remapping IDs, groups, bindings, and frame relationships.
 */
export function duplicateSelectedElementsWithApi(api: ExcalidrawImperativeAPI | null): boolean {
  if (!api) return false;
  const appState = api.getAppState();
  if (!appState || appState.viewModeEnabled) return false;

  const allElements =
    typeof api.getSceneElementsIncludingDeleted === 'function'
      ? api.getSceneElementsIncludingDeleted()
      : api.getSceneElements();
  const targetIds = expandSelectedElementIds(allElements, appState, { includeLocked: false });
  if (targetIds.size === 0) return false;

  const targets = allElements.filter((el) => !el.isDeleted && targetIds.has(el.id));
  if (targets.length === 0) return false;

  const idMap = new Map<string, string>();
  const groupIdMap = new Map<string, string>();
  for (const el of targets) {
    idMap.set(el.id, makeElementId());
    if (Array.isArray(el.groupIds)) {
      for (const gid of el.groupIds) {
        if (!groupIdMap.has(gid)) {
          groupIdMap.set(gid, makeElementId());
        }
      }
    }
  }

  const now = Date.now();
  const nextSelectedElementIds: Record<string, true> = {};
  const clones: OrderedExcalidrawElement[] = targets.map((el) => {
    const nextId = idMap.get(el.id)!;
    const containerId = (el as { containerId?: string | null }).containerId;
    if (!containerId || !idMap.has(containerId)) {
      nextSelectedElementIds[nextId] = true;
    }

    const nextBound = Array.isArray(el.boundElements)
      ? el.boundElements
          .filter((b) => idMap.has(b.id))
          .map((b) => ({ ...b, id: idMap.get(b.id)! }))
      : null;

    const linear = el as ExcalidrawElement & {
      points?: ReadonlyArray<readonly [number, number]>;
      pressures?: readonly number[];
      startBinding?: { elementId: string } | null;
      endBinding?: { elementId: string } | null;
    };
    const imageLike = el as ExcalidrawElement & {
      scale?: readonly [number, number];
    };

    const cloned: Record<string, unknown> = {
      ...el,
      id: nextId,
      x: el.x + 10,
      y: el.y + 10,
      locked: false,
      seed: nextElementNonce(),
      version: 1,
      versionNonce: nextElementNonce(),
      updated: now,
      created: now,
      index: null,
      groupIds: Array.isArray(el.groupIds)
        ? el.groupIds.map((gid) => groupIdMap.get(gid) ?? gid)
        : [],
      frameId: el.frameId && idMap.has(el.frameId) ? idMap.get(el.frameId)! : el.frameId,
      boundElements: nextBound && nextBound.length > 0 ? nextBound : null,
      ...(containerId !== undefined
        ? { containerId: containerId && idMap.has(containerId) ? idMap.get(containerId)! : null }
        : {}),
      ...(linear.points ? { points: linear.points.map((pt) => [...pt]) } : {}),
      ...(linear.pressures ? { pressures: [...linear.pressures] } : {}),
      ...(imageLike.scale ? { scale: [...imageLike.scale] } : {}),
      ...(el.customData ? { customData: { ...el.customData } } : {}),
    };

    if ('startBinding' in linear) {
      cloned.startBinding =
        linear.startBinding && idMap.has(linear.startBinding.elementId)
          ? { ...linear.startBinding, elementId: idMap.get(linear.startBinding.elementId)! }
          : null;
    }
    if ('endBinding' in linear) {
      cloned.endBinding =
        linear.endBinding && idMap.has(linear.endBinding.elementId)
          ? { ...linear.endBinding, elementId: idMap.get(linear.endBinding.elementId)! }
          : null;
    }

    return cloned as unknown as OrderedExcalidrawElement;
  });

  const nextSelectedGroupIds: Record<string, boolean> = {};
  for (const [gid, active] of Object.entries(appState.selectedGroupIds ?? {})) {
    if (!active) continue;
    nextSelectedGroupIds[groupIdMap.get(gid) ?? gid] = true;
  }

  api.updateScene({
    elements: [...allElements, ...clones] as OrderedExcalidrawElement[],
    appState: {
      selectedElementIds: nextSelectedElementIds,
      selectedGroupIds: nextSelectedGroupIds,
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return true;
}
