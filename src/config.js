// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// The port Spoolman listens on out of the box (its Docker image documents
// `-p 7912:8000`).
export const DEFAULT_PORT = 7912;

export const DEFAULT_CONFIG = {
  url: '',
  username: '',
  password: '',
  extra_header: '',
  material_stock: true,
  language: 'fr',
};

// An HTTP header name (RFC 9110 token), and the ones the integration sets itself.
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const RESERVED_HEADERS = new Set([
  'host',
  'content-type',
  'content-length',
  'connection',
  'origin',
]);

/**
 * Turn what the user typed into the base URL of Spoolman, without `/api/v1`:
 * - `192.0.2.10` or `spoolman.local` (no scheme, no port): port 7912;
 * - `192.0.2.10:8000`: that port;
 * - `https://example.org/spoolman/`: exactly that address, a reverse proxy
 *   serving Spoolman under a sub-path (its `SPOOLMAN_BASE_PATH`).
 * A pasted `/api/v1` suffix is dropped. Returns null when it is not usable.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (text === '') {
    return null;
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname === '') {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) {
    // Credentials in the URL would end up in logs and error messages: they
    // have their own fields.
    return null;
  }
  if (!hasScheme && url.port === '') {
    url.port = String(DEFAULT_PORT);
  }
  const path = url.pathname
    .replace(/\/+$/, '')
    .replace(/\/api(\/v1)?$/i, '')
    .replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${path}`;
}

/**
 * `X-Api-Key: abc` -> ['X-Api-Key', 'abc']; null when it is not a header.
 * @param {unknown} raw
 */
export function parseHeader(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const index = raw.indexOf(':');
  if (index <= 0) {
    return null;
  }
  const name = raw.slice(0, index).trim();
  const value = raw.slice(index + 1).trim();
  if (!HEADER_NAME.test(name) || value === '' || /[\r\n]/.test(value)) {
    return null;
  }
  if (RESERVED_HEADERS.has(name.toLowerCase())) {
    return null;
  }
  return [name, value];
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 * @returns {{ url: string | null, urlInvalid: boolean, headers: Record<string, string>,
 *   headerInvalid: boolean, materialStock: boolean, language: string }}
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const typed = text(source.url);
  const url = normalizeUrl(typed);
  const headers = {};
  const username = text(source.username);
  // A password may legitimately start or end with a space: kept as typed.
  const password = typeof source.password === 'string' ? source.password : '';
  if (username !== '' || password !== '') {
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }
  const extra = text(source.extra_header);
  const header = extra === '' ? null : parseHeader(extra);
  if (header) {
    headers[header[0]] = header[1];
  }
  const stock = source.material_stock;
  return {
    url,
    urlInvalid: typed !== '' && url === null,
    headers,
    headerInvalid: extra !== '' && header === null,
    materialStock:
      stock === undefined || stock === null ? true : stock === true || stock === 'true',
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
