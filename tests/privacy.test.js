import test from 'node:test';
import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function checkPrivacy(source, name) {
  for (const match of source.matchAll(/https?:\/\/[^\s'"`<>]+/g)) {
    // The SVG namespace names a vocabulary for createElementNS; nothing is fetched from it.
    if (match[0] === 'http://www.w3.org/2000/svg') continue;
    assert.equal(new URL(match[0]).hostname, 'api.github.com', `${name}: external URL`);
  }
  assert.doesNotMatch(source, /repos\/[\w.-]+\/[\w.-]+/, `${name}: hard-wired repository`);

  // Resolve literal constants as well as direct keys, for injected storage too.
  const constants = new Map([...source.matchAll(/\b(?:const|let|var)\s+(\w+)\s*=\s*(['"`])([^'"`]*)\2/g)]
    .map(match => [match[1], match[3]]));
  const keys = [...constants].filter(([name]) => /key$/i.test(name)).map(([, value]) => value);
  for (const match of source.matchAll(/\b(?:getItem|setItem|removeItem)\s*\(\s*(['"`])([^'"`]*)\1/g)) {
    keys.push(match[2]);
  }
  for (const match of source.matchAll(/\b(?:getItem|setItem|removeItem)\s*\(\s*(\w+)/g)) {
    if (constants.has(match[1])) keys.push(constants.get(match[1]));
  }
  for (const match of source.matchAll(/\blocalStorage\s*\[\s*(['"`])([^'"`]*)\1\s*\]/g)) {
    keys.push(match[2]);
  }
  for (const key of keys) assert.ok(key.startsWith('jop.'), `${name}: storage key outside jop.`);
}

test('all shipped root assets respect network, repository and storage privacy', () => {
  const files = globSync(['*.html', '*.js', '*.css', '*.webmanifest', '*.json'], { cwd: root })
    .filter(name => name !== 'package.json');
  assert.ok(files.includes('github.js') && files.includes('store.js'));
  for (const name of files) checkPrivacy(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'), name);
});

test('privacy guard detects forbidden URLs, literal repositories and storage keys', () => {
  for (const source of [
    'https://example.invalid/file',
    'https://api.github.com.example.invalid/file',
    'http://www.w3.org/2000/svg/other',
    'repos/example/journal',
    "localStorage.setItem('secret', text)",
    'storage.getItem("secret")',
    "const key = 'secret'; storage.removeItem(key)",
    "const configKey = 'secret'; load(configKey)",
    "localStorage['secret'] = text",
  ]) assert.throws(() => checkPrivacy(source, 'synthetic asset'));
  checkPrivacy("const key = 'jop.config'; storage.getItem(key)", 'synthetic asset');
});
