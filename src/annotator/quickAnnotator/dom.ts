// DOM element builders, unified SVG icon rendering, mount slots, and shared UI primitives.
import type { AppLang } from '../../types/annotator';
import { EXCALIDRAW_CLASSES, toolbarTestIdSelector } from '../../excalidraw/domContract';
import { ICON_DEFS, type IconEntry, type IconName } from '../../ui/iconDefs';
import { isMacPlatform } from '../../utils/common';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function formatShortcutLabel(shortcut: string): string {
  if (!shortcut || !isMacPlatform()) return shortcut;
  return shortcut
    .replace(/Ctrl\+Shift\+/g, '⇧⌘')
    .replace(/Ctrl\+/g, '⌘')
    .replace(/Alt\+/g, '⌥');
}

export interface MountedSlotHandle<T> {
  get(host: Element): { lang: AppLang; nodes: Element[]; state: T } | undefined;
  mount(host: Element, lang: AppLang, nodes: Element[], state: T): void;
  clear(host: Element): void;
}

export function createMountedSlot<T>(): MountedSlotHandle<T> {
  const map = new WeakMap<Element, { lang: AppLang; nodes: Element[]; state: T }>();
  const clear = (host: Element) => {
    const prev = map.get(host);
    if (prev) {
      for (const node of prev.nodes) {
        node.remove();
      }
      map.delete(host);
    }
  };
  return {
    get(host) {
      return map.get(host);
    },
    mount(host, lang, nodes, state) {
      clear(host);
      map.set(host, { lang, nodes, state });
    },
    clear,
  };
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | null | undefined> | null,
  ...kids: Array<Node | string | number | boolean | null | undefined>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'class') node.className = v;
      else node.setAttribute(k, v);
    }
  }
  for (const kid of kids) {
    if (kid == null || kid === false || kid === true) continue;
    node.append(typeof kid === 'object' && 'nodeType' in kid ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export function svgIcon(
  name: string,
  size = 16,
  viewBox?: string,
  strokeWidth = 2,
): SVGSVGElement {
  const entry: IconEntry | undefined = ICON_DEFS[name as IconName];
  const resolvedViewBox = viewBox ?? entry?.viewBox ?? '0 0 24 24';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', resolvedViewBox);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of entry?.shapes ?? []) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) shape.setAttribute(k, String(v));
    svg.append(shape);
  }
  return svg;
}

export function cloneNativeToolbarIcon(
  testId: string,
  fallbackIconId: string,
  size = 16,
  strokeWidth = 1.5,
  root: ParentNode = document,
): SVGSVGElement {
  const nativeSvg = testId
    ? root.querySelector<SVGSVGElement>(`${toolbarTestIdSelector(testId)} svg`)
    : null;
  if (nativeSvg && typeof nativeSvg.cloneNode === 'function') {
    const cloned = nativeSvg.cloneNode(true) as SVGSVGElement;
    cloned.setAttribute('width', String(size));
    cloned.setAttribute('height', String(size));
    cloned.setAttribute('aria-hidden', 'true');
    cloned.removeAttribute('class');
    return cloned;
  }
  return svgIcon(fallbackIconId, size, '0 0 24 24', strokeWidth);
}

export function isEditableFocused(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  const tag = active.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || !!active.isContentEditable;
}

export function makeDropdownActionItem({
  className,
  attrs = {},
  icon,
  label,
  onClick,
}: {
  className: string;
  attrs?: Record<string, string>;
  icon: SVGSVGElement;
  label: string;
  onClick: () => void;
}): HTMLButtonElement {
  const btn = el(
    'button',
    {
      type: 'button',
      role: 'menuitem',
      class: `${EXCALIDRAW_CLASSES.dropdownMenuItem} ${EXCALIDRAW_CLASSES.dropdownMenuItemBase} ${className}`,
      ...attrs,
    },
    el('div', { class: EXCALIDRAW_CLASSES.dropdownMenuItemIcon }, icon),
    el('div', { class: EXCALIDRAW_CLASSES.dropdownMenuItemText }, label),
  );
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

export function createAccordionSection({
  rootClass,
  rootAttrs = {},
  toggleAttr,
  iconName,
  label,
  initialOpen,
  onToggle,
}: {
  rootClass: string;
  rootAttrs?: Record<string, string>;
  toggleAttr: string;
  iconName: IconName;
  label: string;
  initialOpen: boolean;
  onToggle: (nextOpen: boolean) => void;
}) {
  const root = el('div', {
    class: `${rootClass}${initialOpen ? ' exq-acc-open' : ''}`,
    ...rootAttrs,
  });
  const chev = el('span', { class: 'exq-acc-chev' }, svgIcon('caret', 12, '0 0 12 12', 1.8));
  const button = el(
    'button',
    {
      type: 'button',
      class: 'exq-acc-flat-btn',
      [toggleAttr]: '1',
      'aria-expanded': String(initialOpen),
    },
    svgIcon(iconName, 14),
    el('span', null, label),
    chev,
  );
  const nest = el('div', { class: 'exq-acc-nest' });

  const setOpen = (open: boolean) => {
    root.classList.toggle('exq-acc-open', open);
    button.setAttribute('aria-expanded', String(open));
  };

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nextOpen = !root.classList.contains('exq-acc-open');
    setOpen(nextOpen);
    onToggle(nextOpen);
  });

  root.append(button, nest);
  return { root, button, nest, setOpen };
}

export function createSwitchRow({
  label,
  optAttr,
  optValue,
  shortcut,
  onClick,
}: {
  label: string;
  optAttr: string;
  optValue: string;
  shortcut?: string;
  onClick: () => void;
}) {
  const switchEl = el('span', {
    class: 'exq-switch',
    'aria-hidden': 'true',
  });
  const displayShortcut = shortcut ? formatShortcutLabel(shortcut) : '';
  const rightSide = displayShortcut
    ? el(
        'span',
        { class: 'exq-opt-right' },
        el('span', { class: 'exq-opt-shortcut', 'aria-hidden': 'true' }, displayShortcut),
        switchEl,
      )
    : switchEl;
  const row = el(
    'button',
    {
      type: 'button',
      class: 'exq-opt-row',
      role: 'switch',
      'aria-checked': 'false',
      'aria-label': label,
      [optAttr]: optValue,
    },
    el('span', { class: 'exq-opt-label' }, label),
    rightSide,
  );
  row.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  const setChecked = (on: boolean) => {
    row.setAttribute('aria-checked', String(on));
    row.classList.toggle('exq-on', on);
    switchEl.classList.toggle('exq-on', on);
  };
  return { row, switchEl, setChecked };
}
