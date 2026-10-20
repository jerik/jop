/**
 * Icons from Lucide 1.52.0 (ISC license, see LICENSE-lucide.txt), copied from
 * the release's SVG files: 24×24, stroke only, colored by currentColor.
 */
export const ICONS = {
  star: [['path', { d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z' }]],
  pencil: [
    ['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }],
    ['path', { d: 'm15 5 4 4' }],
  ],
  info: [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'M12 16v-4' }], ['path', { d: 'M12 8h.01' }]],
  x: [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]],
  'chevron-left': [['path', { d: 'm15 18-6-6 6-6' }]],
};

// The SVG namespace is an identifier, not a network destination.
const SVG = 'http://www.w3.org/2000/svg';
const FRAME = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
  'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
};

/** A decorative inline SVG; the surrounding button carries the accessible name. */
export function icon(document, name) {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [key, value] of Object.entries({ ...FRAME, class: `icon icon-${name}` })) svg.setAttribute(key, value);
  for (const [tag, attributes] of ICONS[name]) {
    const child = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attributes)) child.setAttribute(key, value);
    svg.append(child);
  }
  return svg;
}
