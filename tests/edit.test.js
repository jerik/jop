import test from 'node:test';
import assert from 'node:assert/strict';
import { TARGETS, editable, editedLine, entryAt, localDate, occurrenceOf, targetsFor } from '../edit.js';
import { parseJournal } from '../parser.js';

const date = '2026-10-20';

test('state changes between open states append nothing; closing appends the date', () => {
  assert.equal(editedLine('@todo :kino Film', '@todo-next', '', date), '@todo-next :kino Film');
  assert.equal(editedLine('@done Film # 2026-10-01', '@todo', '', date), '@todo Film # 2026-10-01');
  for (const marker of ['@done', '@canceled', '@past']) {
    assert.equal(editedLine('@todo-wait Film', marker, '', date), `${marker} Film # ${date}`);
  }
  assert.equal(editedLine('@done Film', '@canceled', '', date), `@canceled Film # ${date}`);
});

test('a comment is appended after existing ones, dated, on one line', () => {
  assert.equal(editedLine('@todo Film # alt', '@done', 'gesehen', date), `@done Film # alt # ${date} gesehen`);
  assert.equal(editedLine('@todo-wait X  ', '@todo-wait', '  nach\ngefragt ', date), `@todo-wait X # ${date} nach gefragt`);
  assert.equal(editedLine('@todo-new X', '@todo-new', 'gesehen', date), `@todo-new X # ${date} gesehen`);
});

test('nothing to change gives null', () => {
  assert.equal(editedLine('@todo Film', '@todo', '', date), null);
  assert.equal(editedLine('@todo Film', '@todo', '   ', date), null);
  assert.equal(editedLine('@done Film', '@done', '', date), null);
});

test('editable markers and offered targets', () => {
  const entries = parseJournal('@todo a\n@todo-new b\n@done c\n@canceled d\n@past e\n@feel f\n@todofoo g');
  assert.deepEqual(entries.map(editable), [true, true, true, true, true, false, false]);
  assert.deepEqual(targetsFor(entries[0]), TARGETS);
  assert.deepEqual(targetsFor(entries[1]), ['@todo-new', ...TARGETS]);
  assert.ok(!TARGETS.includes('@todo-new'));
});

test('duplicates are told apart by their occurrence', () => {
  const entries = parseJournal('@todo Same\n@done Other\n@todo Same');
  assert.equal(occurrenceOf(entries, entries[0]), 1);
  assert.equal(occurrenceOf(entries, entries[2]), 2);
  assert.equal(entryAt(entries, '@todo Same', 2), entries[2]);
  assert.equal(entryAt(entries, '@todo Same', 3), null);
});

test('local date is yyyy-mm-dd of the device clock', () => {
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});
