/** Rules for editing one entry; the journal repository's workflow enforces the same. */
export const TARGETS = ['@todo', '@todo-next', '@todo-wait', '@todo-periodic', '@done', '@canceled', '@past'];
const CLOSED = new Set(['@done', '@canceled', '@past']);

export const editable = entry => /^@(?:todo(?:-\S+)?|done|canceled|past)$/.test(entry.marker);

/** Targets offered for an entry; a marker outside TARGETS (e.g. @todo-new) can be kept for a comment. */
export const targetsFor = entry => TARGETS.includes(entry.marker) ? TARGETS : [entry.marker, ...TARGETS];

/**
 * The line after the edit, or null when nothing changes. A comment is appended
 * as ' # yyyy-mm-dd text'; without one, changing into a closed state appends the
 * date alone and changes between open states append nothing.
 */
export function editedLine(raw, marker, comment, date) {
  const old = raw.match(/^@\S+/)?.[0] ?? '';
  const rest = raw.slice(old.length);
  const text = comment.replace(/\s+/g, ' ').trim();
  const stamp = text ? ` # ${date} ${text}` : CLOSED.has(marker) && marker !== old ? ` # ${date}` : '';
  const next = marker + (stamp ? rest.trimEnd() + stamp : rest);
  return next === raw ? null : next;
}

/** Which of the identical lines this entry is, counted from 1 in file order. */
export const occurrenceOf = (entries, entry) =>
  entries.filter(other => other.raw === entry.raw && other.line <= entry.line).length;

export const entryAt = (entries, raw, occurrence) =>
  entries.filter(entry => entry.raw === raw)[occurrence - 1] ?? null;

export function localDate(now = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
