import test from 'node:test';
import assert from 'node:assert/strict';
import { highlightParts, linkParts, versionFor, LOCAL_VERSION, resolveShortlist } from '../display.js';
import { parseJournal } from '../parser.js';

test('highlight splits every occurrence, preserves Unicode and avoids shifted lowercase offsets', () => {
  assert.deepEqual(highlightParts('Äß äẞ!', 'Äß'), [
    { text: 'Äß', mark: true }, { text: ' ', mark: false },
    { text: 'äẞ', mark: true }, { text: '!', mark: false },
  ]);
  for (const search of ['', '  ', 'missing']) assert.deepEqual(highlightParts('Text', search), [{ text: 'Text', mark: false }]);
  assert.deepEqual(highlightParts('İ test', 'test'), [{ text: 'İ test', mark: false }]);
  assert.deepEqual(highlightParts('aaaa', 'aa'), [{ text: 'aa', mark: true }, { text: 'aa', mark: true }]);
});

test('only web schemes become links; punctuation is preserved outside links', () => {
  const text = 'A https://example.invalid/a). http://example.invalid/b, ftp://example.invalid';
  const parts = linkParts(text);
  assert.equal(parts.map(p => p.text).join(''), text);
  assert.deepEqual(parts.filter(p => p.href).map(p => p.href), ['https://example.invalid/a', 'http://example.invalid/b']);
  assert.deepEqual(linkParts('javascript:alert(1)'), [{ text: 'javascript:alert(1)' }]);
  assert.equal(highlightParts(parts[1].text, 'EXAMPLE').filter(p => p.mark)[0].text, 'example');
});

test('version rejects raw Liquid, invalid commits and dates', () => {
  for (const text of ['---\n---\n{}', '{}', '{', '{"commit":"xyz","built":"2026-10-19"}', '{"commit":"","built":"2026-10-19"}', '{"commit":"abcd","built":"bad"}']) assert.equal(versionFor(text), LOCAL_VERSION);
  assert.match(versionFor('{"commit":"87d0e1b123","built":"2026-10-19T20:14:00Z"}'), /^Version 87d0e1b · 19\.10\.2026, \d\d:14$/);
});

test('shortlist preserves added order, prefers exact matches and resolves marker changes', () => {
  const entries = parseJournal('@done :x Task\n@todo :x Task\nPlain text');
  const result = resolveShortlist(['@todo :x Task', '@todo-next :x Task', '@todo Gone', 'Plain text'], entries);
  assert.equal(result[0].entry, entries[1]);
  assert.equal(result[1].entry, entries[0]);
  assert.equal(result[2].missing, true);
  assert.equal(result[2].entry.text, 'Gone');
  assert.equal(result[3].entry.text, 'Plain text');
  assert.equal(result[3].missing, false);
});
