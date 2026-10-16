import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, normalizeUrl, parseHeader } from '../src/config.js';

test('normalizeUrl: default port, explicit port, proxy sub-path, pasted API suffix', () => {
  assert.equal(normalizeUrl('192.0.2.20'), 'http://192.0.2.20:7912');
  assert.equal(normalizeUrl(' spoolman.local '), 'http://spoolman.local:7912');
  assert.equal(normalizeUrl('192.0.2.20:8000'), 'http://192.0.2.20:8000');
  assert.equal(normalizeUrl('https://example.org/spoolman/'), 'https://example.org/spoolman');
  assert.equal(normalizeUrl('http://192.0.2.20:7912/api/v1/'), 'http://192.0.2.20:7912');
  assert.equal(normalizeUrl('http://192.0.2.20'), 'http://192.0.2.20');
});

test('normalizeUrl refuses what it cannot use, and credentials in the address', () => {
  for (const bad of [
    '',
    '   ',
    'ftp://192.0.2.20',
    'http://user:pass@192.0.2.20',
    'http://x/?a=1',
    42,
  ]) {
    assert.equal(normalizeUrl(bad), null, String(bad));
  }
});

test('parseHeader: "Name: value", never a header the integration sets itself', () => {
  assert.deepEqual(parseHeader('X-Api-Key: abc: def'), ['X-Api-Key', 'abc: def']);
  assert.equal(parseHeader('no colon'), null);
  assert.equal(parseHeader('Bad Name: x'), null);
  assert.equal(parseHeader('X-Empty:'), null);
  assert.equal(parseHeader('Origin: http://evil.example'), null);
  assert.equal(parseHeader('Host: other'), null);
});

test('normalizeConfig: Basic auth, extra header, stock option, language', () => {
  const config = normalizeConfig({
    url: '192.0.2.20',
    username: 'gladys',
    password: 's3cret ',
    extra_header: 'X-Token: t0k',
    material_stock: false,
    language: 'de',
  });
  assert.equal(config.url, 'http://192.0.2.20:7912');
  assert.equal(
    config.headers.Authorization,
    `Basic ${Buffer.from('gladys:s3cret ').toString('base64')}`,
  );
  assert.equal(config.headers['X-Token'], 't0k');
  assert.equal(config.materialStock, false);
  assert.equal(config.language, 'de');
  assert.equal(config.urlInvalid, false);
  assert.equal(config.headerInvalid, false);
});

test('normalizeConfig: defaults, an invalid address and an invalid header are reported', () => {
  const empty = normalizeConfig({});
  assert.equal(empty.url, null);
  assert.equal(empty.urlInvalid, false);
  assert.deepEqual(empty.headers, {});
  assert.equal(empty.materialStock, true);
  assert.equal(empty.language, 'fr');
  const bad = normalizeConfig({ url: 'ftp://x', extra_header: 'oops', language: 'it' });
  assert.equal(bad.urlInvalid, true);
  assert.equal(bad.headerInvalid, true);
  assert.equal(bad.language, 'fr');
  assert.equal(normalizeConfig({ material_stock: 'true' }).materialStock, true);
});
