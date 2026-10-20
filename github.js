const repository = ({ owner, repo }) =>
  `https://api.github.com/repos/${[owner, repo].map(encodeURIComponent).join('/')}`;
const headersFor = (token, accept) => ({
  Authorization: `Bearer ${token}`, Accept: accept, 'X-GitHub-Api-Version': '2026-03-10',
});

/** Read one journal file; all access details come from the device config. */
export async function fetchJournal(config, cached, fetchImpl) {
  const { path, ref, token } = config;
  const filePath = path.split('/').map(encodeURIComponent).join('/');
  const url = `${repository(config)}/contents/${filePath}` +
    (ref ? `?ref=${encodeURIComponent(ref)}` : '');
  const headers = headersFor(token, 'application/vnd.github.raw+json');
  if (cached?.etag) headers['If-None-Match'] = cached.etag;

  let response;
  try {
    response = await fetchImpl(url, { method: 'GET', headers, cache: 'no-store' });
  } catch {
    return { kind: 'error', reason: 'offline', status: null };
  }
  const status = response.status;
  if (status === 304) return { kind: 'unchanged' };
  if (status === 200) {
    try {
      const text = await response.text();
      return {
        kind: 'fresh', text, etag: response.headers.get('ETag'),
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      return { kind: 'error', reason: 'offline', status };
    }
  }
  const reason = status === 429 ||
    (status === 403 && response.headers.get('X-RateLimit-Remaining') === '0')
    ? 'rate-limited'
    : ({ 401: 'unauthorized', 403: 'forbidden', 404: 'not-found' }[status] ?? 'other');
  return { kind: 'error', reason, status };
}

/**
 * Ask the journal repository's workflow to replace one line. The dispatch API
 * answers 204 once the event is queued, not when the edit is committed.
 */
export async function sendEdit(config, edit, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(`${repository(config)}/dispatches`, {
      method: 'POST',
      headers: { ...headersFor(config.token, 'application/vnd.github+json'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'journal-edit', client_payload: edit }),
      cache: 'no-store',
    });
  } catch {
    return { kind: 'error', reason: 'offline' };
  }
  if (response.status === 204) return { kind: 'sent' };
  const reason = { 401: 'unauthorized', 403: 'read-only', 404: 'read-only' }[response.status] ?? 'other';
  return { kind: 'error', reason, status: response.status };
}

export function editMessageFor(result) {
  return {
    offline: 'Die Änderung konnte nicht gesendet werden. Bitte die Verbindung prüfen.',
    unauthorized: 'Der Token ist ungültig oder abgelaufen. Die Änderung wurde nicht gesendet.',
    'read-only': 'Der Token darf nicht schreiben. Zum Bearbeiten braucht er Contents: Read and write.',
    other: 'Die Änderung konnte nicht gesendet werden. Bitte später erneut versuchen.',
    late: 'Eine Änderung ist nach zwei Minuten nicht in der Datei angekommen. Bitte im Repository unter Actions nachsehen.',
  }[result.reason] ?? '';
}

export function messageFor(result) {
  if (result.kind !== 'error') return '';
  return {
    unauthorized: 'Der Token ist ungültig oder abgelaufen. Bitte erneut eingeben.',
    forbidden: 'Der Zugriff ist verweigert. Bitte die Token-Berechtigungen prüfen.',
    'not-found': 'Repository oder Dateipfad ist falsch, oder der Zugriff fehlt.',
    'rate-limited': 'Das Anfragelimit ist erreicht. Bitte später erneut versuchen.',
    offline: 'Die Datei konnte nicht geladen werden. Bitte die Verbindung prüfen.',
    other: 'Die Datei konnte nicht geladen werden. Bitte später erneut versuchen.',
  }[result.reason] ?? 'Die Datei konnte nicht geladen werden.';
}
