import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../store.js';

const config = { owner: 'test-owner', repo: 'test-repo', path: 'test.txt', token: 'test-secret' };
const file = { text: '', etag: null, fetchedAt: '2026-10-15T00:00:00.000Z' };
function memory() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('round trips config with optional ref and the last file under the specified keys', () => {
  const storage = memory();
  const store = createStore(storage);
  assert.equal(store.loadConfig(), null);
  assert.equal(store.loadFile(), null);
  for (const value of [config, { ...config, ref: 'test-ref' }]) {
    assert.equal(store.saveConfig(value), true);
    assert.deepEqual(JSON.parse(storage.getItem('jop.config')), value);
    assert.deepEqual(store.loadConfig(), value);
  }
  for (const value of [file, { ...file, text: '@todo Test', etag: '"test-etag"' }]) {
    assert.equal(store.saveFile(value), true);
    assert.deepEqual(JSON.parse(storage.getItem('jop.file')), value);
    assert.deepEqual(store.loadFile(), value);
  }
  assert.equal(store.clearConfig(), true);
  assert.equal(storage.getItem('jop.config'), null);
  assert.equal(storage.getItem('jop.file'), null);
});

test('rejects invalid JSON, missing fields and invalid value types', () => {
  const storage = memory();
  const store = createStore(storage);
  for (const raw of ['{', 'null', '[]', '42']) {
    storage.setItem('jop.config', raw);
    storage.setItem('jop.file', raw);
    assert.equal(store.loadConfig(), null);
    assert.equal(store.loadFile(), null);
  }
  for (const key of ['owner', 'repo', 'path', 'token']) {
    for (const value of [undefined, '', ' ', 42, null]) {
      store.saveConfig({ ...config, [key]: value });
      assert.equal(store.loadConfig(), null);
    }
  }
  store.saveConfig({ ...config, ref: 42 });
  assert.equal(store.loadConfig(), null);
  for (const value of [{}, { ...file, text: null }, { ...file, etag: 42 },
    { ...file, fetchedAt: 'invalid' }, { text: '', fetchedAt: file.fetchedAt }]) {
    store.saveFile(value);
    assert.equal(store.loadFile(), null);
  }
});

test('unavailable storage does not throw and deletion attempts both keys', () => {
  const removed = [];
  const store = createStore({
    getItem() { throw new Error('Unavailable'); },
    setItem() { throw new Error('Full'); },
    removeItem(key) { removed.push(key); throw new Error('Unavailable'); },
  });
  assert.equal(store.loadConfig(), null);
  assert.equal(store.loadFile(), null);
  assert.equal(store.saveConfig(config), false);
  assert.equal(store.saveFile(file), false);
  assert.equal(store.clearConfig(), false);
  assert.deepEqual(removed, ['jop.config', 'jop.file', 'jop.shortlist']);
});

test('shortlist validates, deduplicates and survives a new journal copy until access deletion', () => {
  const storage = memory(), store = createStore(storage);
  assert.deepEqual(store.loadShortlist(), []);
  assert.equal(store.saveShortlist(['@todo A', '@todo A', '@done B']), true);
  assert.deepEqual(JSON.parse(storage.getItem('jop.shortlist')), ['@todo A', '@done B']);
  store.saveFile(file);
  assert.deepEqual(store.loadShortlist(), ['@todo A', '@done B']);
  for (const raw of ['{', 'null', '{}', '[42]', '["a\\nb"]']) {
    storage.setItem('jop.shortlist', raw);
    assert.deepEqual(store.loadShortlist(), []);
  }
  store.saveShortlist(['A']);
  store.clearConfig();
  assert.equal(storage.getItem('jop.shortlist'), null);
});
