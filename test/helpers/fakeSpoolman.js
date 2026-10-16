// -----------------------------------------------------------------------------
// A Spoolman in memory: its REST API (a `fetch` implementation) and its live
// WebSocket (a WebSocket stand-in), answering with the bodies recorded on a
// real Spoolman 0.27.0 (test/fixtures/spoolman/). The tests drive it: a print
// consumes filament, a spool is archived, Spoolman goes down and comes back.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/spoolman/${name}`, import.meta.url), 'utf8'));

export const INFO = fixture('info.json');
export const SPOOLS = fixture('spools.json');
export const WS_SESSION = fixture('ws-session.json');

export const HOST = '192.0.2.20';
export const BASE = `http://${HOST}:7912`;

/** Let pending promises, timers at 0 and socket callbacks run. */
export async function settle(rounds = 20) {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

class FakeSocket {
  constructor(server, url, init) {
    this.server = server;
    this.url = url;
    this.init = init;
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    setImmediate(() => {
      if (this.readyState !== 0) {
        return;
      }
      if (server.down || !server.authorized(init?.headers ?? {})) {
        this.readyState = 3;
        this.onerror?.({});
        this.onclose?.({ code: 1006 });
        return;
      }
      this.readyState = 1;
      server.sockets.add(this);
      this.onopen?.({});
    });
  }

  send() {
    // Spoolman ignores what clients send.
  }

  close() {
    if (this.readyState === 3) {
      return;
    }
    this.readyState = 3;
    this.server.sockets.delete(this);
  }

  /** The server side closes the connection. */
  drop() {
    this.close();
    this.onclose?.({ code: 1006 });
  }
}

export function createSpoolman({ spools = SPOOLS, base = BASE, auth = null } = {}) {
  const server = {
    base,
    spools: structuredClone(spools),
    info: structuredClone(INFO),
    sockets: new Set(),
    down: false,
    // Forced answer of every REST call, e.g. { status: 401 } or { html: true }.
    override: null,
    requests: [],
    socketsOpened: 0,
    // A promise holding every answer of GET /spool (answered with the data
    // of the moment it was asked).
    listGate: null,
    hangUse: false,

    authorized(headers) {
      return !auth || headers.Authorization === auth;
    },

    async fetch(url, init = {}) {
      const target = new URL(url);
      server.requests.push({ method: init.method ?? 'GET', url, headers: init.headers ?? {} });
      if (server.down || `${target.protocol}//${target.host}` !== new URL(base).origin) {
        const err = new TypeError('fetch failed');
        err.cause = { code: 'ECONNREFUSED' };
        throw err;
      }
      if (server.override?.status) {
        return json(server.override.status, { detail: 'Refused by the proxy' });
      }
      if (server.override?.html) {
        return new Response('<html>Login</html>', { status: 200 });
      }
      if (!server.authorized(init.headers ?? {})) {
        return json(401, { detail: 'Unauthorized' });
      }
      const path = target.pathname.slice(new URL(base).pathname.replace(/\/$/, '').length);
      if (path === '/api/v1/info') {
        return json(200, server.info);
      }
      if (path === '/api/v1/spool') {
        const all = target.searchParams.get('allow_archived') === 'true';
        // Snapshotted when the request arrives, like a real server.
        const snapshot = structuredClone(server.spools.filter((s) => all || !s.archived));
        if (server.listGate) {
          await server.listGate;
        }
        return json(200, snapshot);
      }
      const use = path.match(/^\/api\/v1\/spool\/(\d+)\/use$/);
      if (use && init.method === 'PUT') {
        const id = Number(use[1]);
        if (!server.spools.some((s) => s.id === id)) {
          return json(404, { message: `No spool with ID ${id} found.` });
        }
        const body = JSON.parse(init.body);
        const updated = server.consume(id, body.use_weight, body.use_length);
        if (server.hangUse) {
          // Applied, but the answer never comes: the client gives up.
          await new Promise((resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal.reason));
          });
        }
        return json(200, updated);
      }
      return json(404, { detail: 'Not Found' });
    },

    createSocket(url, init) {
      server.socketsOpened += 1;
      return new FakeSocket(server, url, init);
    },

    push(type, resource, payload) {
      const message = JSON.stringify({ type, resource, date: new Date().toISOString(), payload });
      for (const socket of server.sockets) {
        socket.onmessage?.({ data: message });
      }
    },

    spool(id) {
      return server.spools.find((s) => s.id === id);
    },

    /** What Spoolman does on PUT /use: weights, lengths, dates, then a message. */
    consume(id, weight, length) {
      const spool = server.spool(id);
      const density = spool.filament.density;
      const area = Math.PI * (spool.filament.diameter / 2) ** 2;
      const grams = weight ?? (length * area * density) / 1000;
      spool.used_weight += grams;
      spool.used_length = (spool.used_weight * 1000) / (area * density);
      if (spool.remaining_weight !== undefined) {
        spool.remaining_weight = Math.max(0, spool.initial_weight - spool.used_weight);
        spool.remaining_length = (spool.remaining_weight * 1000) / (area * density);
      }
      const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      spool.first_used ??= now;
      spool.last_used = now;
      server.push('updated', 'spool', spool);
      return structuredClone(spool);
    },

    archive(id) {
      server.spool(id).archived = true;
      server.push('updated', 'spool', server.spool(id));
    },

    remove(id) {
      const spool = server.spool(id);
      server.spools = server.spools.filter((s) => s.id !== id);
      server.push('deleted', 'spool', spool);
    },

    add(spool) {
      server.spools.push(spool);
      server.push('added', 'spool', spool);
    },

    goDown() {
      server.down = true;
      for (const socket of [...server.sockets]) {
        socket.drop();
      }
    },

    goUp() {
      server.down = false;
    },
  };
  return server;
}
