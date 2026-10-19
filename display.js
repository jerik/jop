import { parseJournal } from './parser.js';

export function highlightParts(text, search) {
  const needle = search.trim().toLowerCase();
  const lower = text.toLowerCase();
  if (!needle || lower.length !== text.length) return [{ text, mark: false }];
  const parts = [];
  let offset = 0, index;
  while ((index = lower.indexOf(needle, offset)) !== -1) {
    if (index > offset) parts.push({ text: text.slice(offset, index), mark: false });
    parts.push({ text: text.slice(index, index + needle.length), mark: true });
    offset = index + needle.length;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset), mark: false });
  return parts.length ? parts : [{ text, mark: false }];
}

export function linkParts(text) {
  const parts = [];
  let offset = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const url = match[0].replace(/[.,;:!?)}\]]+$/g, '');
    if (match.index > offset) parts.push({ text: text.slice(offset, match.index) });
    parts.push({ text: url, href: url });
    offset = match.index + url.length;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset) });
  return parts.length ? parts : [{ text }];
}

export const LOCAL_VERSION = 'Version: unbekannt (lokal)';
export function versionFor(text) {
  try {
    const { commit, built } = JSON.parse(text);
    if (typeof commit !== 'string' || !/^[a-f0-9]+$/i.test(commit) || !Number.isFinite(Date.parse(built))) return LOCAL_VERSION;
    const date = new Date(built).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    return `Version ${commit.slice(0, 7)} · ${date}`;
  } catch { return LOCAL_VERSION; }
}

const withoutMarker = raw => raw.replace(/^@\S+(?:\s+|$)/, '');
export function resolveShortlist(lines, entries) {
  const exact = new Map(), changed = new Map();
  for (const entry of entries) {
    if (!exact.has(entry.raw)) exact.set(entry.raw, entry);
    const key = withoutMarker(entry.raw);
    if (!changed.has(key)) changed.set(key, entry);
  }
  return lines.map(raw => {
    const entry = exact.get(raw) ?? changed.get(withoutMarker(raw));
    return { raw, entry: entry ?? parseJournal(raw + '\n')[0], missing: !entry };
  });
}
