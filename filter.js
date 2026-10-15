const asArray = value => value == null ? [] : Array.isArray(value) ? value : [value];

/**
 * query: { states, markers, tags, text }. Scalars or arrays are accepted for
 * states, markers and tags. States/markers match any, tags match all (exactly).
 * Empty criteria default to open entries; explicit criteria search all states.
 */
export function filterEntries(entries, query = {}) {
  let states = asArray(query.states);
  const markers = asArray(query.markers);
  const tags = asArray(query.tags);
  const search = (query.text ?? '').trim().toLowerCase();
  if (!states.length && !markers.length && !tags.length && !search) states = ['open'];
  return entries.filter(entry =>
    (!states.length || states.includes(entry.state)) &&
    (!markers.length || markers.includes(entry.marker)) &&
    tags.every(tag => entry.tags.includes(tag)) &&
    (!search || [entry.text, ...entry.tags, entry.note].join(' ').toLowerCase().includes(search))
  ).sort((a, b) => b.line - a.line);
}
