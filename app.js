import { parseJournal } from './parser.js';
import { filterEntries } from './filter.js';
import { createStore } from './store.js';
import { fetchJournal, messageFor } from './github.js';

export const STATES = [
  ['open', 'offen'], ['done', 'erledigt'], ['canceled', 'abgebrochen'],
  ['past', 'abgelaufen'], ['other', 'andere'],
];
export const screenFor = config => config ? 'list' : 'setup';
export const tagsFor = entries => [...new Set(entries.flatMap(entry => entry.tags))]
  .sort((a, b) => a.localeCompare(b, 'de'));
export function messageForView(result, file) {
  return {
    message: result ? messageFor(result) : '',
    timestamp: file ? `Stand: ${new Date(file.fetchedAt).toLocaleString('de-DE')}` : '',
  };
}

/** Keep asynchronous loading independent of the DOM and discard obsolete replies. */
export function createApp({ store, fetchImpl, persist, onChange = () => {} }) {
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

export function mountApp(document, navigator, store, fetchImpl) {
  const root = document.getElementById('app');
  let query = { states: ['open'], tags: [], text: '' };
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function render(view) {
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
        query = { states: ['open'], tags: [], text: '' };
        if (app.setup(config)) form.reset();
      });
      root.append(form);
      if (view.warning) root.append(element('p', view.warning, 'notice'));
      return;
    }
    const clear = element('button', 'Zugang löschen');
    clear.type = 'button';
    clear.addEventListener('click', () => app.clear());
    root.append(clear);
    const messages = messageForView(view.result, view.file);
    const notice = element('p', [messages.message, view.warning].filter(Boolean).join(' '), 'notice');
    notice.setAttribute('role', 'status');
    notice.hidden = !notice.textContent;
    root.append(notice, element('p', messages.timestamp));
    const entries = view.file ? parseJournal(view.file.text) : [];
    const availableTags = tagsFor(entries);
    query.tags = query.tags.filter(tag => availableTags.includes(tag));
    const count = element('p');
    count.setAttribute('aria-live', 'polite');
    const list = element('ol');
    function results() {
      const filtered = filterEntries(entries, query);
      count.textContent = `${filtered.length} ${filtered.length === 1 ? 'Eintrag' : 'Einträge'}`;
      list.replaceChildren(...filtered.map(entry => {
        const item = element('li');
        item.append(element('p', entry.text));
        if (entry.marker !== '@todo') item.append(element('p', entry.marker, 'marker'));
        if (entry.tags.length) item.append(element('p', entry.tags.map(tag => `:${tag}`).join(' '), 'tags'));
        if (entry.note) item.append(element('p', entry.note, 'note'));
        return item;
      }));
    }
    function choices(title, options, field) {
      const group = element('fieldset');
      group.append(element('legend', title));
      for (const [value, title] of options) {
        const label = element('label');
        const input = element('input');
        input.type = 'checkbox';
        input.checked = query[field].includes(value);
        input.addEventListener('change', () => {
          query[field] = input.checked ? [...query[field], value] : query[field].filter(item => item !== value);
          results();
        });
        label.append(input, document.createTextNode(title));
        group.append(label);
      }
      root.append(group);
    }
    choices('Zustand', STATES, 'states');
    choices('Tags (alle gewählten)', availableTags.map(tag => [tag, `:${tag}`]), 'tags');
    const label = element('label', 'Suche');
    const search = element('input');
    search.type = 'search';
    search.value = query.text;
    search.addEventListener('input', () => { query.text = search.value; results(); });
    label.append(search);
    root.append(label, count, list);
    results();
  }
  const app = createApp({
    store, fetchImpl, onChange: render,
    persist: navigator.storage?.persist ? () => navigator.storage.persist() : undefined,
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void app.refresh();
  });
  void app.start();
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
