// -----------------------------------------------------------------------------
// The live feed of Spoolman: its WebSocket on `<base>/api/v1/` (the root path
// carries every resource), one JSON message per change:
//   { "type": "added" | "updated" | "deleted", "resource": "spool" |
//     "filament" | "vendor", "date": "...", "payload": { ...the object } }
//
// Facts checked on Spoolman 0.27.0: the socket sends nothing but these
// messages (no greeting, no keep-alive), so silence is normal and the hub
// keeps a slow REST refresh as a safety net; a filament or vendor change is
// NOT followed by messages for the spools that use it.
//
// Node 22+ ships WebSocket as a global; its non-standard `headers` option
// carries the proxy credentials.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';

export const DEFAULT_LIVE_TIMINGS = {
  reconnectMin: 2_000,
  reconnectMax: 60_000,
  // The backoff resets only once a socket has stayed open that long (a proxy
  // closing idle sockets would otherwise mean a reconnection every 2 s).
  stableAfter: 60_000,
};

export function socketUrl(baseUrl) {
  return `${baseUrl.replace(/^http/i, 'ws')}/api/v1/`;
}

/**
 * Emits `open`, `close` (after an open socket closed) and `message` (the
 * parsed change). Reconnects by itself, with a growing delay, until stop().
 */
export class LiveFeed extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.url normalized base URL
   * @param {Record<string, string>} [options.headers]
   * @param {(url: string, init: object) => WebSocket} [options.createSocket]
   * @param {object} [options.timings]
   */
  constructor({ url, headers = {}, createSocket, timings = {} }) {
    super();
    this.url = url;
    this.headers = headers;
    this.createSocket = createSocket ?? ((target, init) => new WebSocket(target, init));
    this.timings = { ...DEFAULT_LIVE_TIMINGS, ...timings };
    this.socket = null;
    this.running = false;
    this.open = false;
    this.failures = 0;
    this.retryTimer = null;
    this.stableTimer = null;
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.#connect();
  }

  stop() {
    this.running = false;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.#drop();
  }

  /** Close and reconnect at once (the REST safety net saw Spoolman come back). */
  restart() {
    if (!this.running) {
      return;
    }
    this.#drop();
    clearTimeout(this.retryTimer);
    this.failures = 0;
    this.#connect();
  }

  #connect() {
    let socket;
    try {
      socket = this.createSocket(socketUrl(this.url), { headers: this.headers });
    } catch {
      this.#scheduleRetry();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) {
        return;
      }
      this.open = true;
      clearTimeout(this.stableTimer);
      this.stableTimer = setTimeout(() => {
        this.failures = 0;
      }, this.timings.stableAfter);
      this.stableTimer.unref?.();
      this.emit('open');
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) {
        return;
      }
      let data;
      try {
        data = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
      } catch {
        return;
      }
      if (
        data &&
        typeof data === 'object' &&
        typeof data.type === 'string' &&
        typeof data.resource === 'string' &&
        data.payload &&
        typeof data.payload === 'object'
      ) {
        this.emit('message', data);
      }
    };
    socket.onerror = () => {
      // The close event follows and carries the retry.
    };
    socket.onclose = () => {
      if (this.socket !== socket) {
        return;
      }
      const wasOpen = this.open;
      this.#drop();
      if (wasOpen) {
        this.emit('close');
      }
      this.#scheduleRetry();
    };
  }

  #drop() {
    const socket = this.socket;
    this.socket = null;
    this.open = false;
    clearTimeout(this.stableTimer);
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch {
        // already closed
      }
    }
  }

  #scheduleRetry() {
    if (!this.running) {
      return;
    }
    this.failures += 1;
    const delay = Math.min(
      this.timings.reconnectMax,
      this.timings.reconnectMin * 2 ** Math.min(this.failures - 1, 10),
    );
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.running && !this.socket) {
        this.#connect();
      }
    }, delay);
    this.retryTimer.unref?.();
  }
}
