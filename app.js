import { highlightParts, linkParts, resolveShortlist, versionFor, commentsFor, LOCAL_VERSION } from './display.js';
import { parseJournal } from './parser.js';
import { QUICK_GROUPS, groupFor, filterEntries } from './filter.js';
import { createStore } from './store.js';
import { fetchJournal, messageFor, sendEdit, editMessageFor } from './github.js';
import { editable, editedLine, entryAt, localDate, occurrenceOf, targetsFor } from './edit.js';
import { icon } from './icons.js';

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

export const EDIT_POLL_MS = 5000;
export const EDIT_TIMEOUT_MS = 120000;
const countIn = (text, line) => (text ?? '').split(/\r?\n/).filter(current => current === line).length;

/** Keep asynchronous loading independent of the DOM and discard obsolete replies. */
export function createApp({
  store, fetchImpl, persist, onChange = () => {},
  timer = (callback, ms) => setTimeout(callback, ms), now = () => Date.now(),
}) {
  let shortlist = store.loadShortlist?.() ?? [];
  let config = store.loadConfig();
  let file = config ? store.loadFile() : null;
  let result = null;
  let warning = '';
  let generation = 0;
  let pending = null;
  // Edits sent but not yet seen in the file: { line, replacement, count, deadline }.
  let edits = [];
  let editNotice = '';
  let polling = false;
  const snapshot = () => ({
    screen: screenFor(config), file, result, warning, editNotice, pendingLines: edits.map(edit => edit.line),
  });
  const emit = () => onChange(snapshot());
  // An edit has arrived once its new line occurs more often than when it was sent.
  function settle() {
    edits = edits.filter(edit => {
      if (countIn(file?.text, edit.replacement) > edit.count) {
        if (shortlist.includes(edit.line)) {
          shortlist = shortlist.map(line => line === edit.line ? edit.replacement : line);
          store.saveShortlist?.(shortlist);
        }
        return false;
      }
      if (now() <= edit.deadline) return true;
      editNotice = editMessageFor({ reason: 'late' });
      return false;
    });
  }
  function poll() {
    if (polling || !edits.length) return;
    polling = true;
    const current = generation;
    timer(() => {
      if (current !== generation) return;
      polling = false;
      void refresh().then(poll);
    }, EDIT_POLL_MS);
  }
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
      settle();
      emit();
    }).finally(() => { if (current === generation) pending = null; });
    pending = request;
    return request;
  }
  function forget() {
    generation++;
    pending = null;
    edits = [];
    editNotice = '';
    polling = false;
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
    /** Send one edit ({ line, occurrence, replacement }); the entry counts as pending until the file shows it. */
    async edit(change) {
      if (!config) return false;
      const sent = { line: change.line, replacement: change.replacement,
        count: countIn(file?.text, change.replacement), deadline: now() + EDIT_TIMEOUT_MS };
      edits.push(sent);
      editNotice = '';
      emit();
      const current = generation;
      const reply = await sendEdit(config, change, fetchImpl);
      if (current !== generation) return false;
      if (reply.kind !== 'sent') {
        edits = edits.filter(edit => edit !== sent);
        editNotice = editMessageFor(reply);
        emit();
        return false;
      }
      poll();
      return true;
    },
    start() { emit(); return refresh(); },
    refresh,
    setup(next) {
      if (!store.saveConfig(next)) {
        warning = 'Der Zugang konnte nicht auf dem Gerät gespeichert werden.';
        emit();
        return false;
      }
      forget();
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
      forget();
      config = null;
      file = null;
      result = null;
      warning = cleared ? '' : 'Der Zugang konnte nicht vollständig gelöscht werden. Bitte die Websitedaten in den Einstellungen löschen.';
      emit();
    },
  };
}

/**
 * Sub pages, reached at '#/<name>'. Each returns its title and body, or null
 * when it cannot be shown; the frame (sticky header with back button, notice)
 * is added by mountApp for every entry, so a new page gets it too.
 */
export const PAGES = {
  shortlist({ app, entries, element, button, entryItem, confirm, rerender }) {
    const resolved = resolveShortlist(app.readShortlist(), entries);
    const list = element('ol');
    for (const { raw, entry, missing } of resolved) {
      const item = entryItem(entry, { edit: !missing });
      if (missing) item.append(element('p', 'nicht mehr in der Datei', 'note'));
      item.append(button('Entfernen', () => { app.removeShortlist(raw); rerender(); }));
      list.append(item);
    }
    return {
      title: `Shortlist (${resolved.length})`,
      body: [list, button('Alle entfernen', () => {
        if (confirm('Alle Einträge aus der Shortlist entfernen?')) { app.clearShortlist(); rerender(); }
      })],
    };
  },
  info({ app, element, button, confirm, version, messages, leave }) {
    return {
      title: 'Info',
      body: [element('p', version), element('p', messages.timestamp), button('Zugang löschen', () => {
        if (confirm('Zugang und gespeicherte Kopie sowie Shortlist auf diesem Gerät löschen?')) { leave(); app.clear(); }
      })],
    };
  },
  edit({ view, entries, element, button, entryItem, editing, today, focusable, save }) {
    if (!editing) return null;
    const entry = entryAt(entries, editing.raw, editing.occurrence);
    if (!entry || view.pendingLines.includes(entry.raw)) {
      return { title: 'Bearbeiten', body: [element('p', entry
        ? 'Eine Änderung an diesem Eintrag ist unterwegs.'
        : 'Der Eintrag hat sich in der Datei geändert. Bitte zurück und neu öffnen.', 'notice')] };
    }
    const current = element('ol');
    current.append(entryItem(entry));
    const states = element('fieldset', undefined, 'states');
    states.append(element('legend', 'Status'));
    for (const marker of targetsFor(entry)) {
      const label = element('label');
      const input = element('input');
      input.type = 'radio';
      input.name = 'marker';
      input.value = marker;
      input.checked = editing.marker === marker;
      input.addEventListener('change', () => { editing.marker = marker; update(); });
      label.append(input, element('span', marker, 'marker'));
      states.append(label);
    }
    const label = element('label', 'Kommentar');
    const comment = element('input');
    comment.type = 'text';
    comment.value = editing.comment;
    comment.autocomplete = 'off';
    focusable(comment, 'comment');
    comment.addEventListener('input', () => { editing.comment = comment.value; update(); });
    label.append(comment);
    const preview = element('p', undefined, 'preview');
    preview.setAttribute('aria-live', 'polite');
    const submit = button('Speichern', () => {
      const replacement = next();
      if (replacement) save({ line: entry.raw, occurrence: editing.occurrence, replacement });
    });
    const next = () => editedLine(entry.raw, editing.marker, editing.comment, today());
    function update() {
      const line = next();
      preview.textContent = line ? `Neu: ${line}` : 'Keine Änderung';
      submit.disabled = !line;
    }
    update();
    return { title: 'Bearbeiten', body: [current, states, label, preview, submit] };
  },
};
export const routeFor = hash => {
  const name = (hash ?? '').replace(/^#\/?/, '');
  return Object.hasOwn(PAGES, name) ? name : 'list';
};

export function mountApp(document, navigator, store, fetchImpl,
  confirmImpl = message => document.defaultView.confirm(message),
  { win = document.defaultView, today = () => localDate(), timer } = {}) {
  const root = document.getElementById('app');
  let query = { quick: 'todo', tags: [], text: '' };
  let currentView = routeFor(win.location.hash), panelOpen = false, version = LOCAL_VERSION;
  // editing: the entry on the edit page; queued: an edit sent once the page is left.
  let listScroll = 0, editing = null, queued = null;
  let cachedText, cachedEntries = [];
  // Inputs that keep focus and selection across a re-render, by key.
  const focusables = new Map();
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, action, name) {
    const node = element('button', text);
    node.type = 'button';
    if (name) node.setAttribute('aria-label', name);
    node.addEventListener('click', action);
    return node;
  }
  // A button showing an icon, optionally followed by text; name is what screen readers announce.
  function iconButton(iconName, action, name, text) {
    const node = button(undefined, action, name);
    node.classList.add('icon-button');
    node.append(icon(document, iconName));
    if (text !== undefined) node.append(element('span', text));
    return node;
  }
  let filterPanel;
  // Hash routes: in-app navigation pushes history entries, so the back button
  // and the iOS edge swipe both go back the same way.
  function show(next) {
    if (currentView === 'list' && filterPanel) panelOpen = filterPanel.open;
    currentView = next;
    filterPanel = null;
    if (next !== 'edit') editing = null;
    render(app.snapshot());
    if (queued) {
      const change = queued;
      queued = null;
      void app.edit(change);
    }
    if (next === 'list') win.requestAnimationFrame(() => win.scrollTo(0, listScroll));
    else win.scrollTo(0, 0);
  }
  function navigate(next) {
    if (currentView === 'list') listScroll = win.scrollY;
    win.history.pushState({ jop: true }, '', `#/${next}`);
    show(next);
  }
  // Return to the list without a history entry, e.g. when a page opened from a stale URL.
  function leave() {
    win.history.replaceState(null, '', win.location.pathname + win.location.search);
    currentView = 'list';
    filterPanel = null;
  }
  function back() {
    if (win.history.state?.jop) win.history.back();
    else { leave(); show('list'); }
  }
  win.addEventListener('popstate', () => {
    if (currentView === 'list') listScroll = win.scrollY;
    show(routeFor(win.location.hash));
  });

  function render(view) {
    const focusedKey = [...focusables].find(([, node]) => node === document.activeElement)?.[0];
    const focused = focusedKey && focusables.get(focusedKey);
    const selection = focused ? [focused.selectionStart, focused.selectionEnd] : null;
    if (currentView === 'list' && filterPanel) panelOpen = filterPanel.open;
    focusables.clear();
    const focusable = (node, key) => focusables.set(key, node);
    root.replaceChildren();
    if (view.screen === 'setup') {
      root.append(element('h1', 'jop'));
      root.append(element('p', 'Journal einrichten'));
      root.append(element('p', 'Erstelle einen fine-grained Token nur für dieses Repository. Er benötigt Contents: Read and write (Lesen und Bearbeiten); der Zugang wird nur auf diesem Gerät gespeichert.'));
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
        leave();
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
    const notice = element('p', [messages.message, view.warning, view.editNotice].filter(Boolean).join(' '), 'notice');
    notice.setAttribute('role', 'status');
    notice.hidden = !notice.textContent;
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
    // Text, marker, tags, then one line per comment. tools: buttons in the top right corner.
    function entryItem(entry, { tools = [], edit = false } = {}) {
      const item = element('li', undefined, `group-${groupFor(entry)}`);
      item.append(richText('p', entry.text));
      if (entry.marker) item.append(element('p', entry.marker, 'marker'));
      if (entry.tags.length) item.append(richText('p', entry.tags.map(tag => `:${tag}`).join(' '), 'tags', false));
      for (const comment of commentsFor(entry.note)) item.append(richText('p', comment, 'note'));
      const sending = view.pendingLines.includes(entry.raw);
      if (sending) item.append(element('p', 'wird übernommen …', 'note pending'));
      if (edit && !sending && editable(entry)) {
        tools = [...tools, iconButton('pencil', () => {
          editing = { raw: entry.raw, occurrence: occurrenceOf(entries, entry), marker: entry.marker, comment: '' };
          navigate('edit');
        }, 'Bearbeiten')];
      }
      if (tools.length) {
        const box = element('div', undefined, 'tools');
        box.append(...tools);
        item.append(box);
      }
      return item;
    }
    if (currentView !== 'list') {
      const page = PAGES[currentView]({
        app, view, entries, element, button, entryItem, editing, today, focusable, messages, version, leave,
        confirm: confirmImpl,
        rerender: () => render(app.snapshot()),
        save(change) { queued = change; back(); },
      });
      if (page) {
        const header = element('header', undefined, 'page-header');
        header.append(iconButton('chevron-left', back, 'Zurück', 'Zurück'), element('h2', page.title));
        root.append(header, notice, ...page.body);
        restore();
        return;
      }
      leave();
    }
    root.append(element('h1', 'jop'));
    const bar = element('div', undefined, 'top-bar');
    const row = element('div', undefined, 'search-row');
    const label = element('label', 'Suche', 'search-label');
    const search = element('input');
    focusable(search, 'search');
    search.type = 'search';
    search.value = query.text;
    const clearSearch = iconButton('x', () => {
      query.text = ''; search.value = ''; results(); search.focus();
    }, 'Suche löschen');
    const shortlistCount = element('span');
    const shortlistButton = iconButton('star', () => navigate('shortlist'));
    shortlistButton.append(shortlistCount);
    const updateCount = () => {
      const count = app.readShortlist().length;
      shortlistCount.textContent = String(count);
      shortlistButton.setAttribute('aria-label', `Shortlist (${count})`);
    };
    updateCount();
    label.append(search);
    row.append(label, clearSearch, shortlistButton, iconButton('info', () => navigate('info'), 'Info'));
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
        const updateStar = () => {
          const active = app.readShortlist().includes(entry.raw);
          star.setAttribute('aria-label', active ? 'Von Shortlist entfernen' : 'Zur Shortlist');
          star.setAttribute('aria-pressed', String(active));
        };
        const star = iconButton('star', () => {
          app.toggleShortlist(entry.raw); updateStar(); updateCount();
        }, selected.has(entry.raw) ? 'Von Shortlist entfernen' : 'Zur Shortlist');
        star.classList.add('star');
        star.setAttribute('aria-pressed', String(selected.has(entry.raw)));
        return entryItem(entry, { tools: [star], edit: true });
      }));
    }
    search.addEventListener('input', () => { query.text = search.value; results(); });
    root.append(bar, details, notice, element('p', messages.timestamp), count, list);
    results();
    restore();
    function restore() {
      const node = focusedKey && focusables.get(focusedKey);
      if (!node) return;
      node.focus();
      if (selection && node.setSelectionRange) {
        try { node.setSelectionRange(...selection); } catch { /* Search inputs may not support selection. */ }
      }
    }
  }

  const app = createApp({
    store, fetchImpl, onChange: render, ...(timer ? { timer } : {}),
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
