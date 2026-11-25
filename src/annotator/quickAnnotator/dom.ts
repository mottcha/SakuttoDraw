// DOM element builders, unified SVG icon rendering, and shared UI primitives.
import { toolbarTestIdSelector } from '../../excalidraw/domContract';
import { ICON_DEFS, type IconEntry, type IconName } from '../../ui/iconDefs';

const SVG_NS = 'http://www.w3.org/2000/svg';

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

export function getButtonIconSignature(btn: Element | null): string {
  if (!btn || typeof btn.querySelectorAll !== 'function') return '';
  return Array.from(btn.querySelectorAll('svg path, svg circle, svg rect, svg polyline, svg line'))
    .map((n) => n.getAttribute('d') || n.tagName)
    .join('|');
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
  const switchBtn = el('button', {
    type: 'button',
    class: 'exq-switch',
    [optAttr]: optValue,
    'aria-label': label,
  });
  const rightSide = shortcut
    ? el(
        'span',
        { class: 'exq-opt-right' },
        el('span', { class: 'exq-opt-shortcut', 'aria-hidden': 'true' }, shortcut),
        switchBtn,
      )
    : switchBtn;
  const row = el(
    'div',
    { class: 'exq-opt-row', role: 'menuitemcheckbox' },
    el('span', { class: 'exq-opt-label' }, label),
    rightSide,
  );
  row.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return { row, switchBtn };
}
