import { highlightParts, linkParts, resolveShortlist, versionFor, LOCAL_VERSION } from './display.js';
import { parseJournal } from './parser.js';
import { QUICK_GROUPS, groupFor, filterEntries } from './filter.js';
import { createStore } from './store.js';
import { fetchJournal, messageFor } from './github.js';

export const STATES = [
  ['open', 'offen'], ['done', 'erledigt'], ['canceled', 'abgebrochen'],
  ['past', 'abgelaufen'], ['other', 'andere'],
];
export const screenFor = config => config ? 'list' : 'setup';
export const tagsFor = entries => [...new Set(entries.flatMap(entry => entry.tags))]
  .sort((a, b) => a.localeCompare(b, 'de'));
// Count entries per tag; ties keep a stable alphabetical order.
export function tagCountsFor(entries) {
  const counts = new Map();
  for (const entry of entries) {
    for (const tag of new Set(entry.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts].sort(([a, ac], [b, bc]) => bc - ac || a.localeCompare(b, 'de'));
}
export const filterSummary = query => `Tags · ${query.tags.length} aktiv`;
export function messageForView(result, file) {
  return {
    message: result ? messageFor(result) : '',
    timestamp: file ? `Stand: ${new Date(file.fetchedAt).toLocaleString('de-DE')}` : '',
  };
}

/** Keep asynchronous loading independent of the DOM and discard obsolete replies. */
export function createApp({ store, fetchImpl, persist, onChange = () => {} }) {
  let shortlist = store.loadShortlist?.() ?? [];
  let config = store.loadConfig();
  let file = config ? store.loadFile() : null;
  let result = null;
  let warning = '';
  let generation = 0;
  let pending = null;
  const snapshot = () => ({ screen: screenFor(config), file, result, warning });
  const emit = () => onChange(snapshot());
  function refresh() {
    if (!config) return Promise.resolve();
    if (pending) return pending;
    const current = generation;
    const request = fetchJournal(config, file, fetchImpl).then(next => {
      if (current !== generation) return;
      result = next;
      if (next.kind === 'fresh') {
        file = { text: next.text, etag: next.etag, fetchedAt: next.fetchedAt };
        warning = store.saveFile(file) ? '' : 'Die aktuelle Kopie konnte nicht auf dem Gerät gespeichert werden.';
      }
      emit();
    }).finally(() => { if (current === generation) pending = null; });
    pending = request;
    return request;
  }
  return {
    snapshot,
    readShortlist: () => [...shortlist],
    toggleShortlist(raw) {
      shortlist = shortlist.includes(raw) ? shortlist.filter(line => line !== raw) : [...shortlist, raw];
      return store.saveShortlist?.(shortlist) ?? true;
    },
    removeShortlist(raw) {
      shortlist = shortlist.filter(line => line !== raw);
      return store.saveShortlist?.(shortlist) ?? true;
    },
    clearShortlist() {
      shortlist = [];
      return store.saveShortlist?.(shortlist) ?? true;
    },
    start() { emit(); return refresh(); },
    refresh,
    setup(next) {
      if (!store.saveConfig(next)) {
        warning = 'Der Zugang konnte nicht auf dem Gerät gespeichert werden.';
        emit();
        return false;
      }
      generation++;
      pending = null;
      config = next;
      file = null;
      result = null;
      warning = '';
      emit();
      if (persist) {
        try { Promise.resolve(persist()).catch(() => {}); } catch { /* Persistence is optional. */ }
      }
      void refresh();
      return true;
    },
    clear() {
      const cleared = store.clearConfig();
      shortlist = [];
      generation++;
      pending = null;
      config = null;
      file = null;
      result = null;
      warning = cleared ? '' : 'Der Zugang konnte nicht vollständig gelöscht werden. Bitte die Websitedaten in den Einstellungen löschen.';
      emit();
    },
  };
}

export function mountApp(document, navigator, store, fetchImpl, confirmImpl = message => document.defaultView.confirm(message)) {
  const root = document.getElementById('app');
  let query = { quick: 'todo', tags: [], text: '' };
  let currentView = 'list', panelOpen = false, version = LOCAL_VERSION;
  let cachedText, cachedEntries = [];
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  let searchField, filterPanel;
  function render(view) {
    const restoreFocus = searchField && document.activeElement === searchField;
    if (currentView === 'list' && filterPanel) panelOpen = filterPanel.open;
    const selection = restoreFocus ? [searchField.selectionStart, searchField.selectionEnd] : null;
    root.replaceChildren(element('h1', 'jop'));
    if (view.screen === 'setup') {
      root.append(element('p', 'Journal einrichten'));
      root.append(element('p', 'Erstelle einen fine-grained Token nur für dieses Repository. Er benötigt ausschließlich Contents: Read; der Zugang wird nur auf diesem Gerät gespeichert.'));
      const form = element('form');
      for (const [name, title] of [
        ['owner', 'Owner'], ['repo', 'Repository'], ['path', 'Dateipfad'],
        ['ref', 'Branch (optional)'], ['token', 'Token'],
      ]) {
        const label = element('label', title);
        const input = element('input');
        input.name = name;
        input.type = name === 'token' ? 'password' : 'text';
        input.required = name !== 'ref';
        input.autocomplete = 'off';
        input.autocapitalize = 'none';
        input.spellcheck = false;
        label.append(input);
        form.append(label);
      }
      const submit = element('button', 'Zugang speichern');
      submit.type = 'submit';
      form.append(submit);
      form.addEventListener('submit', event => {
        event.preventDefault();
        const config = Object.fromEntries([...form.elements]
          .filter(input => input.name).map(input => [input.name, input.value.trim()]));
        if (['owner', 'repo', 'path', 'token'].some(name => !config[name])) return;
        query = { quick: 'todo', tags: [], text: '' };
        currentView = 'list';
        panelOpen = false;
        if (app.setup(config)) form.reset();
      });
      root.append(form);
      if (view.warning) root.append(element('p', view.warning, 'notice'));
      return;
    }
    const messages = messageForView(view.result, view.file);
    if (view.file?.text !== cachedText) {
      cachedText = view.file?.text;
      cachedEntries = parseJournal(cachedText ?? '');
    }
    const entries = cachedEntries;
    function button(text, action, name) {
      const node = element('button', text);
      node.type = 'button';
      if (name) node.setAttribute('aria-label', name);
      node.addEventListener('click', action);
      return node;
    }
    function navigate(next) {
      if (currentView === 'list' && filterPanel) panelOpen = filterPanel.open;
      currentView = next;
      filterPanel = null;
      render(app.snapshot());
    }
    const back = () => navigate('list');
    function richText(tag, text, className, links = true) {
      const node = element(tag, undefined, className);
      for (const part of links ? linkParts(text) : [{ text }]) {
        const parent = part.href ? element('a') : node;
        if (part.href) {
          parent.href = part.href;
          parent.target = '_blank';
          parent.rel = 'noopener noreferrer';
          node.append(parent);
        }
        for (const piece of highlightParts(part.text, query.text)) {
          parent.append(piece.mark ? element('mark', piece.text) : document.createTextNode(piece.text));
        }
      }
      return node;
    }
    function entryItem(entry) {
      const item = element('li', undefined, `group-${groupFor(entry)}`);
      item.append(richText('p', entry.text));
      if (entry.marker !== '@todo') item.append(element('p', entry.marker, 'marker'));
      if (entry.tags.length) item.append(richText('p', entry.tags.map(tag => `:${tag}`).join(' '), 'tags', false));
      if (entry.note) item.append(richText('p', entry.note, 'note'));
      return item;
    }
    if (currentView === 'info') {
      root.append(element('h2', 'Info'), element('p', version), element('p', messages.timestamp));
      root.append(button('Zugang löschen', () => {
        if (confirmImpl('Zugang und gespeicherte Kopie sowie Shortlist auf diesem Gerät löschen?')) app.clear();
      }), button('Zurück', back));
      return;
    }
    if (currentView === 'shortlist') {
      const resolved = resolveShortlist(app.readShortlist(), entries);
      root.append(element('h2', `Shortlist (${resolved.length})`));
      const list = element('ol');
      for (const { raw, entry, missing } of resolved) {
        const item = entryItem(entry);
        if (missing) item.append(element('p', 'nicht mehr in der Datei', 'note'));
        item.append(button('Entfernen', () => { app.removeShortlist(raw); render(app.snapshot()); }));
        list.append(item);
      }
      root.append(list, button('Alle entfernen', () => {
        if (confirmImpl('Alle Einträge aus der Shortlist entfernen?')) {
          app.clearShortlist(); render(app.snapshot());
        }
      }), button('Zurück', back));
      return;
    }
    const bar = element('div', undefined, 'top-bar');
    const row = element('div', undefined, 'search-row');
    const label = element('label', 'Suche', 'search-label');
    const search = element('input');
    searchField = search;
    search.type = 'search';
    search.value = query.text;
    const clearSearch = button('×', () => {
      query.text = ''; search.value = ''; results(); search.focus();
    }, 'Suche löschen');
    const shortlistButton = button('', () => navigate('shortlist'));
    const updateCount = () => { shortlistButton.textContent = `★ ${app.readShortlist().length}`; };
    updateCount();
    label.append(search);
    row.append(label, clearSearch, shortlistButton, button('ⓘ', () => navigate('info'), 'Info'));
    const chips = element('div', undefined, 'quick-filters');
    const groupCounts = new Map(QUICK_GROUPS.map(group => [group.id, 0]));
    for (const entry of entries) groupCounts.set(groupFor(entry), groupCounts.get(groupFor(entry)) + 1);
    const chipButtons = [];
    for (const group of QUICK_GROUPS) {
      const chip = button(`${group.label} (${groupCounts.get(group.id)})`, () => {
        query.quick = query.quick === group.id ? '' : group.id; results();
      });
      chip.className = `chip group-${group.id}`;
      chipButtons.push([group.id, chip]);
      chips.append(chip);
    }
    bar.append(row, chips);
    const notice = element('p', [messages.message, view.warning].filter(Boolean).join(' '), 'notice');
    notice.setAttribute('role', 'status');
    notice.hidden = !notice.textContent;
    const count = element('p');
    count.setAttribute('aria-live', 'polite');
    const list = element('ol');
    const details = element('details');
    details.open = panelOpen;
    filterPanel = details;
    const summary = element('summary');
    details.append(summary);
    const tagCounts = tagCountsFor(entries);
    const group = element('fieldset');
    group.append(element('legend', 'Tags (alle gewählten)'));
    for (const [tag, count] of tagCounts) {
      const label = element('label');
      const input = element('input');
      input.type = 'checkbox';
      input.checked = query.tags.includes(tag);
      input.addEventListener('change', () => {
        query.tags = input.checked ? [...query.tags, tag] : query.tags.filter(value => value !== tag);
        results();
      });
      label.append(input, document.createTextNode(`:${tag} (${count})`));
      group.append(label);
    }
    details.append(group);
    function results() {
      clearSearch.hidden = !query.text;
      summary.textContent = filterSummary(query);
      for (const [id, chip] of chipButtons) chip.setAttribute('aria-pressed', String(query.quick === id));
      const filtered = filterEntries(entries, query);
      const selected = new Set(app.readShortlist());
      count.textContent = `${filtered.length} ${filtered.length === 1 ? 'Eintrag' : 'Einträge'}`;
      list.replaceChildren(...filtered.map(entry => {
        const item = entryItem(entry);
        const updateStar = () => {
          const active = app.readShortlist().includes(entry.raw);
          star.textContent = active ? '★' : '☆';
          star.setAttribute('aria-label', active ? 'Von Shortlist entfernen' : 'Zur Shortlist');
          star.setAttribute('aria-pressed', String(active));
        };
        const star = button(selected.has(entry.raw) ? '★' : '☆', () => {
          app.toggleShortlist(entry.raw); updateStar(); updateCount();
        }, selected.has(entry.raw) ? 'Von Shortlist entfernen' : 'Zur Shortlist');
        star.className = 'star';
        star.setAttribute('aria-pressed', String(selected.has(entry.raw)));
        item.append(star);
        return item;
      }));
    }
    search.addEventListener('input', () => { query.text = search.value; results(); });
    root.append(bar, details, notice, element('p', messages.timestamp), count, list);
    results();
    if (restoreFocus) {
      search.focus();
      if (selection && search.setSelectionRange) {
        try { search.setSelectionRange(...selection); } catch { /* Search inputs may not support selection. */ }
      }
    }
  }

  const app = createApp({
    store, fetchImpl, onChange: render,
    persist: navigator.storage?.persist ? () => navigator.storage.persist() : undefined,
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void app.refresh();
  });
  void app.start();
  Promise.resolve().then(() => fetchImpl('./version.json')).then(response => {
    if (response.ok === false) throw new Error('Version unavailable');
    return response.text();
  }).then(text => { version = versionFor(text); if (currentView === 'info') render(app.snapshot()); }).catch(() => {});
  return app;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  let storage;
  try { storage = window.localStorage; } catch { storage = null; }
  mountApp(document, navigator, createStore(storage), window.fetch.bind(window));
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
