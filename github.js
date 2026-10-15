/** Read one journal file; all access details come from the device config. */
export async function fetchJournal(config, cached, fetchImpl) {
  const { owner, repo, path, ref, token } = config;
  const segments = [owner, repo].map(encodeURIComponent);
  const filePath = path.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${segments.join('/')}/contents/${filePath}` +
    (ref ? `?ref=${encodeURIComponent(ref)}` : '');
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.raw+json',
    'X-GitHub-Api-Version': '2026-03-10',
  };
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
