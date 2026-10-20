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

test('filter summary counts selected tags, excluding search text', () => {
  assert.equal(filterSummary({ states: [], tags: [], text: 'Film' }), 'Tags · 0 aktiv');
  assert.equal(filterSummary({ states: ['open'], tags: [], text: '' }), 'Tags · 0 aktiv');
  assert.equal(filterSummary({ states: ['open'], tags: ['kino'], text: '' }), 'Tags · 1 aktiv');
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
  get classList() { return { add: name => { this.className = [this.className, name].filter(Boolean).join(' '); } }; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  all(tag) { return this.children.flatMap(child => [child, ...child.all('*')]).filter(child => tag === '*' || child.tag === tag); }
  get elements() { return this.all('input'); }
  reset() { for (const input of this.elements) input.value = ''; }
}

// History double: pushState/replaceState keep a stack, back() fires popstate.
function fakeWindow(hash = '') {
  const listeners = {};
  const stack = [{ state: null, hash }];
  let index = 0;
  const win = {
    scrollY: 0,
    location: { pathname: '/jop/', search: '', get hash() { return stack[index].hash; } },
    history: {
      get state() { return stack[index].state; },
      get length() { return stack.length; },
      pushState(state, _, url) { stack.splice(index + 1); stack.push({ state, hash: url }); index++; },
      replaceState(state, _, url) { stack[index] = { state, hash: url.includes('#') ? url.slice(url.indexOf('#')) : '' }; },
      back() { if (index > 0) { index--; listeners.popstate(); } },
    },
    addEventListener: (name, listener) => { listeners[name] = listener; },
    scrollTo: (x, y) => { win.scrollY = y; },
    requestAnimationFrame: callback => callback(),
    fire: name => listeners[name](),
  };
  return win;
}

// Mounted app with stored access; text is what the next fetch returns.
async function mounted(text, { hash = '', dispatchStatus = 204 } = {}) {
  const { mountApp } = await import('../app.js');
  const root = new Node('main');
  const win = fakeWindow(hash);
  const h = { root, win, text, dispatches: [], timers: [], dispatchStatus, shortlist: [] };
  const document = {
    getElementById: () => root,
    createElement: tag => new Node(tag),
    createElementNS: (namespace, tag) => new Node(tag),
    createTextNode: value => new Node('#text', value),
    addEventListener() {},
    visibilityState: 'visible',
  };
  const store = {
    loadConfig: () => config, loadFile: () => null, saveConfig: () => true, saveFile: () => true,
    clearConfig: () => true, loadShortlist: () => h.shortlist, saveShortlist: list => { h.shortlist = [...list]; return true; },
  };
  h.app = mountApp(document, {}, store, async (url, options) => {
    if (url.endsWith('/dispatches')) { h.dispatches.push(JSON.parse(options.body)); return { status: h.dispatchStatus }; }
    if (url === './version.json') return { ok: false };
    return { status: 200, headers: new Map(), text: async () => h.text };
  }, () => true, { win, today: () => '2026-10-20', timer: callback => h.timers.push(callback) });
  await h.app.refresh();
  h.button = label => root.all('button').find(node => node.textContent === label || node['aria-label'] === label);
  h.texts = className => root.all('p').filter(node => node.className === className).map(node => node.all('#text').map(t => t.textContent).join('') || node.textContent);
  return h;
}

test('every sub page renders inside the same frame: sticky header with back button and title', async () => {
  const { PAGES } = await import('../app.js');
  const h = await mounted('@todo :lesen Erstes # Notiz');
  for (const name of Object.keys(PAGES)) {
    // The edit page needs an entry, so it is opened the way the owner opens it.
    if (name === 'edit') h.button('Bearbeiten').listeners.click();
    else { h.win.history.pushState({ jop: true }, '', `#/${name}`); h.win.fire('popstate'); }
    await h.app.refresh();
    const [header] = h.root.children;
    assert.equal(header.tag, 'header', name);
    assert.equal(header.className, 'page-header', name);
    assert.equal(header.children[0]['aria-label'], 'Zurück', name);
    assert.equal(header.children[1].tag, 'h2', name);
    h.button('Zurück').listeners.click();
    assert.equal(h.root.children[0].textContent, 'jop', name);
  }
});

test('hash routes: back goes through history, keeps the list scroll, and stale routes fall back to the list', async () => {
  const h = await mounted('@todo Erstes');
  h.win.scrollY = 480;
  h.button('Shortlist (0)').listeners.click();
  assert.equal(h.win.location.hash, '#/shortlist');
  assert.equal(h.win.scrollY, 0);
  assert.ok(h.root.all('h2').some(node => node.textContent === 'Shortlist (0)'));
  h.button('Zurück').listeners.click();
  assert.equal(h.win.location.hash, '');
  assert.equal(h.win.scrollY, 480);
  assert.equal(h.win.history.length, 2);

  const opened = await mounted('@todo Erstes', { hash: '#/info' });
  assert.ok(opened.root.all('h2').some(node => node.textContent === 'Info'));
  opened.button('Zurück').listeners.click();
  assert.equal(opened.win.location.hash, '');
  assert.equal(opened.win.history.length, 1);
  assert.equal(opened.root.children[0].textContent, 'jop');

  const stale = await mounted('@todo Erstes', { hash: '#/edit' });
  assert.equal(stale.win.location.hash, '');
  assert.equal(stale.root.children[0].textContent, 'jop');
});

test('entries show every marker and one line per comment', async () => {
  const h = await mounted('@todo :lesen Erstes # alt # 2026-10-20 neu');
  assert.deepEqual(h.texts('marker'), ['@todo']);
  assert.deepEqual(h.texts('note'), ['alt', '2026-10-20 neu']);
});

test('editing sends the new line, marks the entry until the file shows it, and the shortlist follows', async () => {
  const h = await mounted('@todo Same\n@todo-wait Warten # alt\n@todo Same');
  h.button('wait (1)').listeners.click();
  const item = h.root.all('li')[0];
  item.all('button')[0].listeners.click();
  assert.deepEqual(h.shortlist, ['@todo-wait Warten # alt']);
  item.all('button').find(node => node['aria-label'] === 'Bearbeiten').listeners.click();
  assert.equal(h.win.location.hash, '#/edit');
  const preview = () => h.root.all('p').find(node => node.className === 'preview').textContent;
  const save = h.button('Speichern');
  assert.equal(preview(), 'Keine Änderung');
  assert.equal(save.disabled, true);
  const radios = h.root.all('input').filter(node => node.type === 'radio');
  assert.deepEqual(radios.map(node => node.value), ['@todo', '@todo-next', '@todo-wait', '@todo-periodic', '@done', '@canceled', '@past']);
  assert.equal(radios.find(node => node.checked).value, '@todo-wait');
  radios.find(node => node.value === '@done').listeners.change();
  assert.equal(preview(), 'Neu: @done Warten # alt # 2026-10-20');
  const comment = h.root.all('input').find(node => node.type === 'text');
  comment.value = 'erledigt';
  comment.listeners.input();
  assert.equal(preview(), 'Neu: @done Warten # alt # 2026-10-20 erledigt');
  save.listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.win.location.hash, '');
  assert.deepEqual(h.dispatches, [{ event_type: 'journal-edit', client_payload: {
    line: '@todo-wait Warten # alt', occurrence: 1, replacement: '@done Warten # alt # 2026-10-20 erledigt',
  } }]);
  assert.ok(h.texts('note pending').length === 1);
  assert.ok(!h.root.all('button').some(node => node['aria-label'] === 'Bearbeiten'));
  assert.equal(h.timers.length, 1);
  h.text = '@todo Same\n@done Warten # alt # 2026-10-20 erledigt\n@todo Same';
  h.timers.shift()();
  await h.app.refresh();
  assert.equal(h.texts('note pending').length, 0);
  assert.deepEqual(h.shortlist, ['@done Warten # alt # 2026-10-20 erledigt']);
  assert.equal(h.timers.length, 0);
});

test('the second of two identical lines is sent with its occurrence; a refused dispatch is visible', async () => {
  const h = await mounted('@todo Same\n@done Other\n@todo Same', { dispatchStatus: 403 });
  h.root.all('li')[0].all('button').find(node => node['aria-label'] === 'Bearbeiten').listeners.click();
  h.root.all('input').find(node => node.value === '@todo-next').listeners.change();
  h.button('Speichern').listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.dispatches[0].client_payload.occurrence, 2);
  assert.match(h.texts('notice').join(' '), /Read and write/);
  assert.equal(h.texts('note pending').length, 0);
});

test('DOM wires setup, default state, combined filters, visibility refresh and access deletion', async () => {
  const { mountApp } = await import('../app.js');
  const root = new Node('main');
  const events = {};
  const document = {
    getElementById: () => root,
    createElement: tag => new Node(tag),
    createElementNS: (namespace, tag) => new Node(tag),
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
  }, message => { confirmations.push(message); return confirmed; }, { win: fakeWindow() });
  assert.equal(root.all('form').length, 1);
  const form = root.all('form')[0];
  for (const input of form.elements) input.value = config[input.name] ?? '';
  assert.equal(form.elements.find(input => input.name === 'token').type, 'password');
  form.listeners.submit({ preventDefault() {} });
  await app.refresh();
  assert.equal(persists, 1);
  assert.equal(root.all('li').length, 1);
  assert.equal(root.all('li')[0].all('p')[0].all('#text')[0].textContent, 'Erstes');
  assert.ok(root.all('p').some(node => node.className === 'note'));
  const originalItem = root.all('li')[0];
  const star = originalItem.all('button')[0];
  star.listeners.click();
  assert.equal(star['aria-pressed'], 'true');
  assert.equal(star['aria-label'], 'Von Shortlist entfernen');
  assert.equal(star.all('svg').length, 1);
  assert.equal(root.all('li')[0], originalItem);
  assert.ok(root.all('button').some(node => node['aria-label'] === 'Shortlist (1)'));
  star.listeners.click();
  assert.equal(star['aria-pressed'], 'false');
  const details = root.all('details')[0];
  assert.equal(details.open, false);
  assert.equal(root.all('summary')[0].textContent, 'Tags · 0 aktiv');
  assert.equal(root.all('fieldset')[0].all('#text')[0].textContent, ':lesen (3)');
  details.open = true;
  root.all('button').find(node => node.textContent === 'todo (1)').listeners.click();
  assert.equal(root.all('li').length, 3);
  const tag = root.all('fieldset')[0].all('input')[0];
  tag.checked = true;
  tag.listeners.change();
  const search = root.all('input').find(node => node.type === 'search');
  search.value = 'NOTIZ';
  search.listeners.input();
  assert.equal(root.all('li').length, 1);
  assert.ok(root.all('p').some(node => node.textContent === '1 Eintrag'));
  assert.equal(root.all('summary')[0].textContent, 'Tags · 1 aktiv');
  document.activeElement = search;
  document.createElement = tag => {
    const node = new Node(tag);
    node.focus = () => { document.activeElement = node; };
    return node;
  };
  events.visibilitychange();
  assert.equal(fetches, 2);
  document.visibilityState = 'visible';
  events.visibilitychange();
  await app.refresh();
  assert.equal(fetches, 3);
  const refreshedSearch = root.all('input').find(node => node.type === 'search');
  assert.equal(refreshedSearch.value, 'NOTIZ');
  assert.equal(document.activeElement, refreshedSearch);
  assert.equal(root.all('details')[0].open, true);
  assert.equal(root.all('li').length, 1);
  root.all('button').find(node => node['aria-label'] === 'Info').listeners.click();
  root.all('button').find(node => node.textContent === 'Zugang löschen').listeners.click();
  assert.ok(stored);
  document.visibilityState = 'visible';
  events.visibilitychange();
  await app.refresh();
  assert.ok(root.all('h2').some(node => node.textContent === 'Info'));
  assert.match(confirmations[0], /gespeicherte Kopie/);
  confirmed = true;
  root.all('button').find(node => node.textContent === 'Zugang löschen').listeners.click();
  assert.equal(stored, null);
  assert.equal(root.all('form').length, 1);
});

test('createApp owns shortlist order, defensive reads, persistence and access deletion', () => {
  let saved;
  const app = createApp({ store: {
    loadConfig: () => config, loadFile: () => copy, loadShortlist: () => ['A'],
    saveShortlist: list => { saved = [...list]; return true; }, clearConfig: () => true,
  } });
  app.readShortlist().push('ignored');
  app.toggleShortlist('B');
  assert.deepEqual(saved, ['A', 'B']);
  app.toggleShortlist('A');
  app.toggleShortlist('A');
  assert.deepEqual(app.readShortlist(), ['B', 'A']);
  app.removeShortlist('B');
  assert.deepEqual(saved, ['A']);
  app.clearShortlist();
  assert.deepEqual(saved, []);
  app.toggleShortlist('C');
  app.clear();
  assert.deepEqual(app.readShortlist(), []);
});

test('an edit that never reaches the file is dropped after the timeout with a notice; clear stops polling', async () => {
  const { EDIT_TIMEOUT_MS } = await import('../app.js');
  let clock = 0;
  const timers = [];
  const app = createApp({
    store: { loadConfig: () => config, loadFile: () => copy, saveFile: () => true, clearConfig: () => true },
    fetchImpl: async url => url.endsWith('/dispatches') ? { status: 204 } : { status: 304 },
    timer: callback => timers.push(callback), now: () => clock,
  });
  assert.equal(await app.edit({ line: '@todo Lesen', occurrence: 1, replacement: '@done Lesen # 2026-10-20' }), true);
  assert.deepEqual(app.snapshot().pendingLines, ['@todo Lesen']);
  timers.shift()();
  await app.refresh();
  assert.deepEqual(app.snapshot().pendingLines, ['@todo Lesen']);
  clock = EDIT_TIMEOUT_MS + 1;
  timers.shift()();
  await app.refresh();
  assert.deepEqual(app.snapshot().pendingLines, []);
  assert.match(app.snapshot().editNotice, /zwei Minuten/);
  await app.edit({ line: '@todo Lesen', occurrence: 1, replacement: '@todo-next Lesen' });
  app.clear();
  assert.deepEqual(app.snapshot().pendingLines, []);
  for (const callback of timers.splice(0)) callback();
  assert.equal(app.snapshot().screen, 'setup');
});
