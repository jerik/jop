import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseJournal } from '../parser.js';

// Counts supplied by issue #2 for the recorded, anonymised journal.
const journal = readFileSync(new URL('../journal.anon.txt', import.meta.url), 'utf8');
test('recorded journal retains all lines and marker counts', () => {
  const entries = parseJournal(journal);
  assert.equal(entries.length, 4545);
  const counts = {};
  for (const entry of entries) counts[entry.marker] = (counts[entry.marker] ?? 0) + 1;
  assert.deepEqual(counts, {
    '@todo': 2254, '@done': 1571, '@canceled': 262, '@past': 234,
    '@todo-new': 142, '@todo-wait': 42, '@todo-periodic': 11,
    '@todo-next': 10, '@feel': 10, '@day': 4, '@delegated': 3,
    '@floskel': 1, '@bookmark': 1,
  });
  assert.equal(entries.at(-1).line, 4545);
});

test('extracts tags and first note while preserving unspecified syntax and Unicode', () => {
  const raw = '@todo-next :kino Grüße 👋 // 23913323.1413 =51593363 :abend # Notiz :kein-tag # Rest';
  assert.deepEqual(parseJournal(raw + '\n'), [{
    line: 1, raw, marker: '@todo-next', state: 'open', tags: ['kino', 'abend'],
    text: 'Grüße 👋 // 23913323.1413 =51593363', note: 'Notiz :kein-tag # Rest',
  }]);
});

test('keeps unknown markers, embedded colons and physical line numbers', () => {
  const entries = parseJournal('@unknown :tag x:y\r\n@todo-future task\r\n@past old\r\n@canceled stop\r\n@done finished');
  assert.deepEqual(entries.map(e => e.state), ['other', 'open', 'past', 'canceled', 'done']);
  assert.equal(entries[0].marker, '@unknown');
  assert.equal(entries[0].text, 'x:y');
  assert.equal(entries[0].note, '');
  assert.equal(entries[4].line, 5);
  assert.deepEqual(parseJournal(''), []);
});
