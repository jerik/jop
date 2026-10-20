import test from 'node:test';
import assert from 'node:assert/strict';
import { ICONS, icon } from '../icons.js';

test('every icon is a decorative 24×24 stroke SVG built from its Lucide shapes', () => {
  const made = [];
  const document = {
    createElementNS: (namespace, tag) => {
      const node = { namespace, tag, attributes: {}, children: [],
        setAttribute(key, value) { this.attributes[key] = value; }, append(child) { this.children.push(child); } };
      made.push(node);
      return node;
    },
  };
  assert.deepEqual(Object.keys(ICONS).sort(), ['chevron-left', 'info', 'pencil', 'star', 'x']);
  for (const name of Object.keys(ICONS)) {
    const svg = icon(document, name);
    assert.equal(svg.tag, 'svg');
    assert.equal(svg.namespace, 'http://www.w3.org/2000/svg');
    assert.equal(svg.attributes.viewBox, '0 0 24 24');
    assert.equal(svg.attributes.stroke, 'currentColor');
    assert.equal(svg.attributes['aria-hidden'], 'true');
    assert.equal(svg.attributes.class, `icon icon-${name}`);
    assert.deepEqual(svg.children.map(child => [child.tag, child.attributes]), ICONS[name]);
  }
  assert.ok(made.every(node => node.namespace === 'http://www.w3.org/2000/svg'));
});
