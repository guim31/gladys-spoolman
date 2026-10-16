// -----------------------------------------------------------------------------
// The REST API of Spoolman (`<base>/api/v1/...`), the few calls the
// integration needs.
//
// Facts checked on Spoolman 0.27.0 (image ghcr.io/donkie/spoolman):
// - no authentication of its own: a reverse proxy may add one (Basic auth, a
//   token header), hence the optional headers;
// - a request carrying a foreign `Origin` header is refused in 403 ("trusting
//   writes and websockets from this instance's own origin only"). Node's fetch
//   and WebSocket send none, so the integration is never caught by it;
// - `GET /spool` hides the archived spools unless `allow_archived=true`;
// - `PUT /spool/<id>/use` takes `use_weight` (g) or `use_length` (mm), and
//   accepts a negative amount (it gives filament back): the integration only
//   sends positive ones; a spool without weight data still records the use;
// - an unknown id answers 404 `{ "message": "No spool with ID 99 found." }`.
// -----------------------------------------------------------------------------

export const DEFAULT_TIMEOUT = 10_000;

export class SpoolmanError extends Error {
  /**
   * @param {'unreachable' | 'unauthorized' | 'forbidden' | 'not_found' | 'timeout' | 'http' | 'invalid'} kind
   * @param {string} message never carries the headers (credentials)
   * @param {number} [status]
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'SpoolmanError';
    this.kind = kind;
    this.status = status;
  }
}

export class SpoolmanClient {
  /**
   * @param {object} options
   * @param {string} options.url normalized base URL (see normalizeUrl)
   * @param {Record<string, string>} [options.headers]
   * @param {typeof fetch} [options.fetch]
   * @param {number} [options.timeout]
   */
  constructor({ url, headers = {}, fetch: fetchImpl, timeout = DEFAULT_TIMEOUT }) {
    this.url = url;
    this.headers = headers;
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.timeout = timeout;
  }

  get apiUrl() {
    return `${this.url}/api/v1`;
  }

  async #request(method, path, body) {
    const headers = { ...this.headers, Accept: 'application/json' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    let response;
    try {
      response = await this.fetch(`${this.apiUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeout),
        redirect: 'follow',
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new SpoolmanError('timeout', `No answer from Spoolman within ${this.timeout} ms`);
      }
      const cause = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? 'error';
      throw new SpoolmanError('unreachable', `Spoolman unreachable (${cause})`);
    }
    const raw = await response.text().catch(() => '');
    let data;
    try {
      data = raw === '' ? null : JSON.parse(raw);
    } catch {
      data = null;
    }
    if (!response.ok) {
      const detail =
        typeof data?.message === 'string'
          ? data.message
          : typeof data?.detail === 'string'
            ? data.detail
            : `HTTP ${response.status}`;
      const kind =
        response.status === 401
          ? 'unauthorized'
          : response.status === 403
            ? 'forbidden'
            : response.status === 404
              ? 'not_found'
              : 'http';
      throw new SpoolmanError(kind, detail.slice(0, 200), response.status);
    }
    if (data === null && raw !== '') {
      // A proxy login page answering 200 in HTML, for instance.
      throw new SpoolmanError('invalid', 'The answer is not JSON: is this the Spoolman address?');
    }
    return data;
  }

  /** `{ version, ... }` */
  async info() {
    const data = await this.#request('GET', '/info');
    if (!data || typeof data.version !== 'string') {
      throw new SpoolmanError('invalid', 'This address does not answer like Spoolman');
    }
    return data;
  }

  /** Every spool, archived ones included (their archiving is an event). */
  async spools() {
    const data = await this.#request('GET', '/spool?allow_archived=true');
    if (!Array.isArray(data)) {
      throw new SpoolmanError('invalid', 'Spoolman did not answer a list of spools');
    }
    return data;
  }

  /**
   * Record a consumption on a spool; resolves with the updated spool.
   * @param {number} id
   * @param {{ weight?: number, length?: number }} amount grams, or millimetres
   */
  use(id, { weight, length }) {
    const body = weight !== undefined ? { use_weight: weight } : { use_length: length };
    return this.#request('PUT', `/spool/${encodeURIComponent(id)}/use`, body);
  }
}
