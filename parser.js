/** Parse journal lines in file order; tags exclude ':' and absent notes are ''. */
export function parseJournal(text) {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines.map((raw, index) => {
    const marker = raw.match(/^@\S+/)?.[0] ?? '';
    const state = marker === '@todo' || marker.startsWith('@todo-')
      ? 'open'
      : ({ '@done': 'done', '@canceled': 'canceled', '@past': 'past' }[marker] ?? 'other');
    const remainder = raw.slice(marker.length);
    const noteStart = remainder.indexOf(' # ');
    const note = noteStart < 0 ? '' : remainder.slice(noteStart + 3);
    const body = noteStart < 0 ? remainder : remainder.slice(0, noteStart);
    const tags = [];
    const content = body.replace(/(^|\s):([\p{L}][\p{L}\p{N}_-]*)/gu, (match, space, tag) => {
      tags.push(tag);
      return space;
    }).trim();
    return { line: index + 1, raw, marker, state, tags, note, text: content };
  });
}
