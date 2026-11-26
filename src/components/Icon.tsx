import { createElement } from 'react';
import { ICON_DEFS, type IconName } from '../ui/iconDefs';

const SVG_ATTR_TO_REACT: Readonly<Record<string, string>> = {
  'stroke-width': 'strokeWidth',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-opacity': 'strokeOpacity',
  'fill-opacity': 'fillOpacity',
};

function toReactSvgProps(attrs: Readonly<Record<string, string | number>>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(attrs)) {
    out[SVG_ATTR_TO_REACT[k] ?? k] = v;
  }
  return out;
}

export interface IconProps {
  name: IconName;
  size?: number;
  width?: number;
  height?: number;
  strokeWidth?: number;
  viewBox?: string;
  className?: string;
}

/**
 * Renders any icon defined in `src/ui/iconDefs.ts` as an accessible inline SVG.
 */
export function Icon({
  name,
  size = 14,
  width,
  height,
  strokeWidth = 2,
  viewBox,
  className,
}: IconProps) {
  const entry = ICON_DEFS[name];
  return (
    <svg
      width={width ?? size}
      height={height ?? size}
      viewBox={viewBox ?? ('viewBox' in entry ? entry.viewBox : undefined) ?? '0 0 24 24'}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {entry.shapes.map(([tag, attrs], idx) =>
        createElement(tag, { key: idx, ...toReactSvgProps(attrs) }),
      )}
    </svg>
  );
}
