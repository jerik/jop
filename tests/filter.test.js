import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseJournal } from '../parser.js';
import { filterEntries } from '../filter.js';

test('default returns all 2459 open journal entries newest first', () => {
  const entries = parseJournal(readFileSync(new URL('../journal.anon.txt', import.meta.url), 'utf8'));
  const result = filterEntries(entries);
  assert.equal(result.length, 2459);
  assert.ok(result.every(e => e.state === 'open'));
  assert.ok(result.every((e, i) => i === 0 || result[i - 1].line > e.line));
  assert.deepEqual(filterEntries(entries, {}), result);
});

const entries = parseJournal('@todo :kino :abend Grüße 👋 # ZUSATZ\n@done :kino Film\n@todo-wait :abend Warten\n@unknown :kino Etwas');
const lines = query => filterEntries(entries, query).map(e => e.line);

test('combines criteria with AND and alternatives within states and markers', () => {
  assert.deepEqual(lines({ states: ['open', 'done'] }), [3, 2, 1]);
  assert.deepEqual(lines({ markers: ['@done', '@unknown'] }), [4, 2]);
  assert.deepEqual(lines({ tags: 'kino' }), [4, 2, 1]);
  assert.deepEqual(lines({ tags: ['kino', 'abend'] }), [1]);
  assert.deepEqual(lines({ states: 'open', markers: ['@todo', '@done'], tags: 'kino', text: 'GRÜẞE' }), [1]);
  assert.deepEqual(lines({ states: 'done', tags: 'abend' }), []);
});

test('searches text, tags and note case-insensitively', () => {
  assert.deepEqual(lines({ text: 'KiNo' }), [4, 2, 1]);
  assert.deepEqual(lines({ text: 'zusatz' }), [1]);
  assert.deepEqual(lines({ text: '👋' }), [1]);
  assert.deepEqual(lines({ text: 'film' }), [2]);
  assert.deepEqual(lines({ markers: '@unknown' }), [4]);
});

test('does not mutate the input or entries and handles empty criteria', () => {
  const frozen = entries.map(e => Object.freeze({ ...e, tags: Object.freeze([...e.tags]) }));
  Object.freeze(frozen);
  assert.deepEqual(filterEntries(frozen).map(e => e.line), [3, 1]);
  assert.deepEqual(lines({ states: [], markers: [], tags: [], text: ' ' }), [3, 1]);
  assert.deepEqual(filterEntries([]), []);
  assert.deepEqual(frozen.map(e => e.line), [1, 2, 3, 4]);
});

test('quick groups include only exact markers and combine with all other criteria', async () => {
  const { QUICK_GROUPS, groupFor } = await import('../filter.js');
  const items = parseJournal('@todo A\n@todo-next :x B\n@todo-wait C\n@todo-periodic D\n@todo-new E\n@todo-future F\n@done G\nNo marker\n@feel H\n@unknown I');
  assert.deepEqual(items.map(groupFor), ['todo', 'next', 'wait', 'periodic', 'new', 'other', 'other', 'other', 'other', 'other']);
  assert.equal(QUICK_GROUPS.length, 6);
  assert.equal(filterEntries(items, { quick: '' }).length, 10);
  assert.equal(filterEntries(items, { quick: 'other' }).length, 5);
  assert.equal(filterEntries(items, { quick: 'next', tags: ['x'], text: 'b' }).length, 1);
  assert.equal(filterEntries(items, { quick: 'todo', tags: ['x'] }).length, 0);
});
