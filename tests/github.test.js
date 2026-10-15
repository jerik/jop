import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJournal, messageFor } from '../github.js';

// Synthetic access details, unrelated to the owner's private journal.
const config = { owner: 'test owner', repo: 'test repo', path: 'folder/test file.txt', token: 'test-secret' };
const response = (status, headers = {}, text = 'journal text') => ({
  status,
  headers: new Headers(headers),
  text: async () => text,
});

test('sends exactly one encoded GET with the specified headers and optional ref and ETag', async () => {
  for (const ref of [undefined, '', 'test/ref with space']) {
    for (const cached of [null, {}, { etag: '"test-etag"' }]) {
      const calls = [];
      const before = Date.now();
      const result = await fetchJournal({ ...config, ref }, cached, async (...args) => {
        calls.push(args);
        return response(200, { ETag: '"new-etag"' });
      });
      const expectedHeaders = {
        Authorization: 'Bearer test-secret',
        Accept: 'application/vnd.github.raw+json',
        'X-GitHub-Api-Version': '2026-03-10',
      };
      if (cached?.etag) expectedHeaders['If-None-Match'] = cached.etag;
      assert.deepEqual(calls, [[
        'https://api.github.com/repos/test%20owner/test%20repo/contents/folder/test%20file.txt' +
          (ref ? '?ref=test%2Fref%20with%20space' : ''),
        { method: 'GET', headers: expectedHeaders, cache: 'no-store' },
      ]]);
      assert.equal(result.kind, 'fresh');
      assert.equal(result.text, 'journal text');
      assert.equal(result.etag, '"new-etag"');
      assert.equal(new Date(result.fetchedAt).toISOString(), result.fetchedAt);
      assert.ok(Date.parse(result.fetchedAt) >= before && Date.parse(result.fetchedAt) <= Date.now());
      assert.ok(!calls[0][0].includes(config.token));
    }
  }
});

test('handles empty text and missing ETag, and does not read a 304 body', async () => {
  const fresh = await fetchJournal(config, null, async () => response(200, {}, ''));
  assert.equal(fresh.text, '');
  assert.equal(fresh.etag, null);
  assert.deepEqual(await fetchJournal(config, null, async () => ({ status: 304 })), { kind: 'unchanged' });
});

for (const [status, headers, reason] of [
  [401, {}, 'unauthorized'],
  [403, {}, 'forbidden'],
  [403, { 'X-RateLimit-Remaining': '0' }, 'rate-limited'],
  [403, { 'X-RateLimit-Remaining': '1' }, 'forbidden'],
  [404, {}, 'not-found'],
  [429, {}, 'rate-limited'],
  [429, { 'X-RateLimit-Remaining': '1' }, 'rate-limited'],
  [500, {}, 'other'],
  [201, {}, 'other'],
]) {
  test(`maps HTTP ${status} with ${JSON.stringify(headers)} to ${reason}`, async () => {
    const result = await fetchJournal(config, null, async () => response(status, headers));
    assert.deepEqual(result, { kind: 'error', reason, status });
    assert.ok(messageFor(result).length > 0);
    assert.ok(!messageFor({ ...result, token: config.token }).includes(config.token));
  });
}

test('network and interrupted body failures produce offline results without exception details', async () => {
  const fail = async () => { throw new Error(config.token); };
  const offline = await fetchJournal(config, null, fail);
  assert.deepEqual(offline, { kind: 'error', reason: 'offline', status: null });
  assert.ok(!messageFor(offline).includes(config.token));
  assert.deepEqual(await fetchJournal(config, null, async () => ({ ...response(200), text: fail })),
    { kind: 'error', reason: 'offline', status: 200 });
  assert.equal(messageFor({ kind: 'fresh' }), '');
  assert.equal(messageFor({ kind: 'unchanged' }), '');
});
