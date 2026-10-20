import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { inflateSync } from 'node:zlib';
import { makeIcon } from '../tools/generate-icons.js';
import { createHash } from 'node:crypto';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
function worker(caches, fetch = () => { throw new Error('Unexpected network'); }) {
  const handlers = {};
  runInNewContext(read('sw.js'), {
    self: { location: { origin: 'https://app.invalid' }, addEventListener: (name, handler) => { handlers[name] = handler; } },
    caches, fetch, URL,
  });
  return handlers;
}

test('manifest uses relative standalone identity and German names with any-purpose icons', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  for (const field of ['id', 'start_url', 'scope']) assert.equal(manifest[field], './');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'de');
  assert.match(manifest.name, /Journal lesen/);
  assert.match(manifest.short_name, /lesen/);
  assert.deepEqual(manifest.icons, [192, 512].map(size => ({
    src: `./icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any',
  })));
});

test('HTML allows zoom, applies the specified CSP and uses only external scripts and styles', () => {
  const html = read('index.html');
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.deepEqual(csp.split(';').map(directive => directive.trim()), [
    "default-src 'self'", "connect-src 'self' https://api.github.com", "img-src 'self'", "style-src 'self'",
  ]);
  assert.match(html, /rel="manifest" href="\.\/manifest.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="\.\/icon-180.png"/);
  assert.doesNotMatch(html, /apple-mobile-web-app-|<style\b|\sstyle\s*=|\son\w+\s*=/i);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.match(scripts[0][1], /type="module" src="\.\/app.js"/);
  assert.equal(scripts[0][2].trim(), '');
});

test('worker does not intercept GitHub or any cross-origin request, nor non-GET requests', () => {
  const handlers = worker({});
  for (const [url, method] of [
    ['https://api.github.com/repos/anything', 'GET'],
    ['https://other.invalid/file', 'GET'], ['https://app.invalid/file', 'POST'],
  ]) handlers.fetch({ request: { url, method }, respondWith: () => assert.fail('intercepted') });
});

test('worker installs the complete shell and removes only older app caches', async () => {
  let assets, current;
  const deleted = [];
  const handlers = worker({
    open: async name => { current = name; return { addAll: async files => { assets = [...files]; } }; },
    keys: async () => [current, 'jop.shell.old', 'unrelated'],
    delete: async name => { deleted.push(name); },
  });
  let pending;
  handlers.install({ waitUntil: promise => { pending = promise; } });
  await pending;
  for (const name of ['display.js', 'edit.js', 'icons.js', 'version.json', 'app.js', 'app.css', 'github.js', 'store.js', 'parser.js', 'filter.js', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png']) {
    assert.ok(assets.includes(`./${name}`));
    assert.ok(readFileSync(new URL(`../${name}`, import.meta.url)).length);
  }
  assert.ok(assets.includes('./'));
  assert.equal(current, 'jop.shell.v5');
  handlers.activate({ waitUntil: promise => { pending = promise; } });
  await pending;
  assert.deepEqual(deleted, ['jop.shell.old']);
});

test('same-origin requests use the cache first and network on a miss', async () => {
  let fetches = 0, cached = { body: 'shell' }, response;
  const handlers = worker({ open: async () => ({ match: async () => cached }) }, async () => { fetches++; return 'network'; });
  const event = { request: { url: 'https://app.invalid/jop/app.js', method: 'GET' }, respondWith: promise => { response = promise; } };
  handlers.fetch(event);
  assert.equal(await response, cached);
  assert.equal(fetches, 0);
  cached = null;
  handlers.fetch(event);
  assert.equal(await response, 'network');
  assert.equal(fetches, 1);
});

test('committed icons reproduce the generator and have valid dimensions and image data', () => {
  for (const size of [180, 192, 512]) {
    const png = readFileSync(new URL(`../icon-${size}.png`, import.meta.url));
    assert.deepEqual(png, makeIcon(size));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    const compressedSize = png.readUInt32BE(33);
    assert.equal(inflateSync(png.subarray(41, 41 + compressedSize)).length, size * (1 + size * 3));
  }
});

// Fingerprint of everything the worker caches. A shipped file that changes
// without a new CACHE_VERSION would never reach an installed app.
function shellFingerprint() {
  const source = read('sw.js');
  const shell = JSON.parse(source.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  const hash = createHash('sha256');
  for (const path of shell.filter(path => path !== './')) {
    hash.update(path);
    hash.update(readFileSync(new URL(`../${path}`, import.meta.url)));
  }
  return { version: source.match(/const CACHE_VERSION = '([^']+)'/)[1], hash: hash.digest('hex') };
}

test('a change to any cached file comes with a new CACHE_VERSION', () => {
  const { version, hash } = shellFingerprint();
  const known = JSON.parse(read('tests/shell-versions.json'));
  assert.equal(known[version], hash,
    `Shipped files changed. Raise CACHE_VERSION in sw.js and add "${version.replace(/\d+$/, n => Number(n) + 1)}": "<hash>" to tests/shell-versions.json (current hash ${hash}).`);
  assert.equal(new Set(Object.values(known)).size, Object.keys(known).length, 'two cache versions share one fingerprint');
});
