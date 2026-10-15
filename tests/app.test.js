import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, screenFor, tagsFor, tagCountsFor, filterSummary, messageForView } from '../app.js';
import { parseJournal } from '../parser.js';
import { readFileSync } from 'node:fs';

// Synthetic access details, unrelated to the owner's private journal.
const config = { owner: 'test owner', repo: 'test repo', path: 'test file.txt', token: 'test-secret' };
const copy = { text: '@todo Lesen', etag: 'version', fetchedAt: '2026-10-15T12:00:00Z' };
function harness({ configured = true, response, saveConfig = true, saveFile = true, clear = true } = {}) {
  const changes = [], calls = [], saved = [];
  let persists = 0, clears = 0;
  const app = createApp({
    store: {
      loadConfig: () => configured ? config : null,
      loadFile: () => copy,
      saveConfig: () => saveConfig,
      saveFile: file => { saved.push(file); return saveFile; },
      clearConfig: () => { clears++; return clear; },
    },
    fetchImpl: (url, options) => { calls.push({ url, options }); return response; },
    persist: () => { persists++; return Promise.resolve(true); },
    onChange: view => changes.push(view),
  });
  return { app, changes, calls, saved, persists: () => persists, clears: () => clears };
}
const unchanged = { status: 304 };

test('screen, messages and timestamp are independent of the DOM', () => {
  assert.equal(screenFor(null), 'setup');
  assert.equal(screenFor({}), 'list');
  const view = messageForView({ kind: 'error', reason: 'offline' }, copy);
  assert.match(view.message, /Verbindung/);
  assert.match(view.timestamp, /^Stand: .*2026/);
  assert.deepEqual(messageForView(null, null), { message: '', timestamp: '' });
  assert.equal(messageForView({ kind: 'unchanged' }, copy).message, '');
});

test('tags come from the actual journal, are unique and sorted without changing entries', () => {
  const entries = parseJournal(readFileSync(new URL('../journal.anon.txt', import.meta.url), 'utf8'));
  const before = structuredClone(entries);
  const tags = tagsFor(entries);
  assert.deepEqual(new Set(tags), new Set(entries.flatMap(entry => entry.tags)));
  assert.deepEqual(tags, [...tags].sort((a, b) => a.localeCompare(b, 'de')));
  assert.deepEqual(entries, before);
  assert.deepEqual(tagsFor([]), []);
});

test('tag frequencies count entries and sort descending with alphabetical ties', () => {
  const entries = parseJournal('@todo :kino :kino :abend\n@done :kino\n@todo :zwei :abend :alpha');
  assert.deepEqual(tagCountsFor(entries), [['abend', 2], ['kino', 2], ['alpha', 1], ['zwei', 1]]);
  assert.deepEqual(tagCountsFor([]), []);
});

test('filter summary counts selected states and tags, excluding search text', () => {
  assert.equal(filterSummary({ states: [], tags: [], text: 'Film' }), 'Filter · 0 aktiv');
  assert.equal(filterSummary({ states: ['open'], tags: [], text: '' }), 'Filter · 1 aktiv');
  assert.equal(filterSummary({ states: ['open'], tags: ['kino'], text: '' }), 'Filter · 2 aktiv');
});

test('start shows the copy synchronously and passes its ETag; unchanged keeps it', async () => {
  const h = harness({ response: unchanged });
  const pending = h.app.start();
  assert.equal(h.changes[0].file, copy);
  assert.equal(h.calls[0].options.headers['If-None-Match'], copy.etag);
  await pending;
  assert.equal(h.app.snapshot().file, copy);
  assert.equal(h.saved.length, 0);
});

test('fresh response is saved and emitted; storage failures are visible', async () => {
  const h = harness({ saveFile: false, response: {
    status: 200, text: async () => '@todo Neu', headers: new Map([['ETag', 'new']]),
  } });
  await h.app.start();
  assert.equal(h.app.snapshot().file.text, '@todo Neu');
  assert.equal(h.saved[0].etag, 'new');
  assert.match(h.app.snapshot().warning, /nicht.*gespeichert/);
});

test('network errors keep the stored copy and its timestamp', async () => {
  const h = harness({ response: Promise.reject(new Error('offline')) });
  await h.app.start();
  const view = h.app.snapshot();
  assert.equal(view.file, copy);
  assert.match(messageForView(view.result, view.file).message, /Verbindung/);
  assert.match(messageForView(view.result, view.file).timestamp, /^Stand:/);
});

test('setup persists once, starts loading, and clearing returns to setup', async () => {
  const h = harness({ configured: false, response: unchanged });
  await h.app.start();
  assert.equal(h.calls.length, 0);
  assert.equal(h.app.snapshot().file, null);
  assert.equal(h.app.setup(config), true);
  await h.app.refresh();
  assert.equal(h.persists(), 1);
  assert.equal(h.app.snapshot().screen, 'list');
  h.app.clear();
  assert.equal(h.clears(), 1);
  assert.equal(h.app.snapshot().screen, 'setup');
  assert.equal(h.app.snapshot().file, null);
});

test('failed setup does not fetch or request persistence', async () => {
  const h = harness({ configured: false, saveConfig: false });
  assert.equal(h.app.setup(config), false);
  assert.equal(h.app.snapshot().screen, 'setup');
  assert.match(h.app.snapshot().warning, /nicht.*gespeichert/);
  assert.equal(h.persists(), 0);
  assert.equal(h.calls.length, 0);
});

test('refresh deduplicates in-flight requests and ignores replies after clear', async () => {
  let resolve;
  const h = harness({ response: new Promise(done => { resolve = done; }) });
  const pending = h.app.start();
  h.app.refresh();
  assert.equal(h.calls.length, 1);
  h.app.clear();
  resolve({ status: 200, text: async () => 'late', headers: new Map() });
  await pending;
  assert.equal(h.saved.length, 0);
  assert.equal(h.app.snapshot().file, null);
});

test('refresh after a completed request fetches again; deletion failure is visible', async () => {
  const h = harness({ response: unchanged, clear: false });
  await h.app.start();
  await h.app.refresh();
  assert.equal(h.calls.length, 2);
  h.app.clear();
  assert.match(h.app.snapshot().warning, /nicht vollständig gelöscht/);
});

// Minimal DOM double exercises browser wiring without a browser or network.
class Node {
  constructor(tag, text = '') {
    this.tag = tag;
    this.textContent = text;
    this.children = [];
    this.listeners = {};
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  all(tag) { return this.children.flatMap(child => [child, ...child.all('*')]).filter(child => tag === '*' || child.tag === tag); }
  get elements() { return this.all('input'); }
  reset() { for (const input of this.elements) input.value = ''; }
}

test('DOM wires setup, default state, combined filters, visibility refresh and access deletion', async () => {
  const { mountApp } = await import('../app.js');
  const root = new Node('main');
  const events = {};
  const document = {
    getElementById: () => root,
    createElement: tag => new Node(tag),
    createTextNode: text => new Node('#text', text),
    addEventListener: (name, listener) => { events[name] = listener; },
    visibilityState: 'hidden',
  };
  let stored = null, fetches = 0, persists = 0;
  let confirmed = false;
  const confirmations = [];
  const store = {
    loadConfig: () => stored, loadFile: () => null,
    saveConfig: value => { stored = value; return true; },
    saveFile: () => true, clearConfig: () => { stored = null; return true; },
  };
  const app = mountApp(document, { storage: { persist: () => { persists++; return Promise.resolve(true); } } }, store, async () => {
    fetches++;
    return {
      status: 200, headers: new Map(),
      text: async () => '@todo :lesen Erstes # Notiz\n@done :lesen Fertig\n@todo-next :lesen Zweites',
    };
  }, message => { confirmations.push(message); return confirmed; });
  assert.equal(root.all('form').length, 1);
  const form = root.all('form')[0];
  for (const input of form.elements) input.value = config[input.name] ?? '';
  assert.equal(form.elements.find(input => input.name === 'token').type, 'password');
  form.listeners.submit({ preventDefault() {} });
  await app.refresh();
  assert.equal(persists, 1);
  assert.equal(root.all('li').length, 2);
  assert.equal(root.all('li')[0].all('p')[0].textContent, 'Zweites');
  assert.ok(root.all('p').some(node => node.textContent === '@todo-next'));
  assert.ok(root.all('p').some(node => node.textContent === 'Notiz' && node.className === 'note'));
  const details = root.all('details')[0];
  assert.equal(details.open, false);
  assert.equal(root.all('summary')[0].textContent, 'Filter · 1 aktiv');
  assert.deepEqual(root.children.map(node => node.tag), ['h1', 'p', 'p', 'label', 'details', 'p', 'ol', 'button']);
  assert.equal(root.all('fieldset')[1].all('#text')[0].textContent, ':lesen (3)');
  details.open = true;
  const states = root.all('fieldset')[0].all('input');
  assert.equal(states[0].checked, true);
  states[1].checked = true;
  states[1].listeners.change();
  assert.equal(root.all('li').length, 3);
  const tag = root.all('fieldset')[1].all('input')[0];
  tag.checked = true;
  tag.listeners.change();
  const search = root.all('input').find(node => node.type === 'search');
  search.value = 'NOTIZ';
  search.listeners.input();
  assert.equal(root.all('li').length, 1);
  assert.ok(root.all('p').some(node => node.textContent === '1 Eintrag'));
  assert.equal(root.all('summary')[0].textContent, 'Filter · 3 aktiv');
  document.activeElement = search;
  document.createElement = tag => {
    const node = new Node(tag);
    node.focus = () => { document.activeElement = node; };
    return node;
  };
  events.visibilitychange();
  assert.equal(fetches, 1);
  document.visibilityState = 'visible';
  events.visibilitychange();
  await app.refresh();
  assert.equal(fetches, 2);
  const refreshedSearch = root.all('input').find(node => node.type === 'search');
  assert.equal(refreshedSearch.value, 'NOTIZ');
  assert.equal(document.activeElement, refreshedSearch);
  assert.equal(root.all('details')[0].open, true);
  assert.equal(root.all('li').length, 1);
  root.all('button').find(node => node.textContent === 'Zugang löschen').listeners.click();
  assert.ok(stored);
  assert.match(confirmations[0], /gespeicherte Kopie/);
  confirmed = true;
  root.all('button').find(node => node.textContent === 'Zugang löschen').listeners.click();
  assert.equal(stored, null);
  assert.equal(root.all('form').length, 1);
});
