// -----------------------------------------------------------------------------
// The hub: the link to one Spoolman (REST + live WebSocket feed) and
// everything Gladys sees of it — devices, states, connection status, scene
// events, consumptions.
//
// Spoolman pushes every change on its WebSocket; a REST read of the whole list
// runs at start, at each (re)connection of the feed, after a filament or
// vendor change (not followed by spool messages), and every 5 minutes as a
// safety net (a silent socket is normal, a dead one is not detectable).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  SPOOL_TYPE,
  STOCK_TYPE,
  buildSpoolDevice,
  buildSpoolStates,
  buildStockDevice,
  buildStockStates,
  parseDeviceId,
  spoolIds,
  stockIds,
} from './devices.js';
import { SpoolmanClient, SpoolmanError } from './spoolman/client.js';
import { LiveFeed } from './spoolman/live.js';
import { parseSpool, stockByMaterial } from './spoolman/model.js';
import {
  STATUS_LABELS,
  STATUS_TEXT,
  TEST_TEXT,
  USED_TEXT,
  commandMessage,
  formatAmount,
  formatGrams,
} from './texts.js';

const logger = createLogger({ name: 'spoolman-hub' });

export const WIDGET_KEY = 'spools';
export const TRIGGERS = { used: 'filament_used', archived: 'spool_archived' };

export const DEFAULT_TIMINGS = {
  // The REST safety net.
  refreshInterval: 5 * 60_000,
  // A filament renamed: one read for a burst of messages.
  refreshDebounce: 1_000,
  // A print reports its consumption in small steps (Moonraker every few
  // seconds): one `filament_used` event once it has been quiet that long.
  usageSettle: 2 * 60_000,
  // requestWidgetRefresh is dropped by the core beyond one call per 10 s.
  widgetGap: 10_500,
  // An unchanged value is sent again before Gladys calls it stale (48 h).
  heartbeat: 6 * 3_600_000,
  // A consumption that timed out may still land: its echo is ours that long.
  ownUseGrace: 30_000,
  requestTimeout: 10_000,
};

// One bound for both units: the forms declare a single `max`.
export const USE_LIMITS = { grams: 5_000, meters: 5_000 };
export const USE_UNITS = Object.keys(USE_LIMITS);

/** An Error carrying a coded, multi-language message. */
export class CommandError extends Error {
  constructor(code, language, ...args) {
    const messages = commandMessage(code, ...args);
    super(messages[language] ?? messages.en);
    this.code = code;
    this.messages = messages;
  }
}

export class Hub {
  constructor({ gladys, fetch, createSocket, timings, now = Date.now }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.createSocket = createSocket;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.now = now;
    this.config = {
      url: null,
      urlInvalid: false,
      headers: {},
      materialStock: true,
      language: 'fr',
    };
    this.client = null;
    this.live = null;
    /** id -> parsed spool, archived ones included */
    this.spools = new Map();
    this.loaded = false;
    this.version = null;
    /** null (fine), or the kind of the last failure */
    this.failure = null;
    this.lastStatus = '';
    this.liveSeen = false;
    this.announced = false;
    // id -> { grams, timer }: consumptions waiting for the print to settle
    this.usage = new Map();
    // id -> number of our own consumptions in flight (never an event: no loop)
    this.ownUse = new Map();
    // id -> sequence of the last live message or own consumption: a REST
    // answer older than that must not overwrite the spool (it would count a
    // consumption twice, or archive it twice).
    this.touched = new Map();
    this.touchSeq = 0;
    this.configuring = Promise.resolve();
    this.refreshTimer = null;
    this.debounceTimer = null;
    this.refreshing = null;
    this.refreshAgain = false;
    this.widgetRefreshAt = 0;
    this.widgetTimer = null;
    this.publishFailing = false;
    this.stopped = false;
  }

  get language() {
    return this.config.language;
  }

  async start(config) {
    await this.reconfigure(config);
  }

  /** One configuration change at a time: a second one waits for the first. */
  reconfigure(config) {
    const run = this.configuring.then(() => this.#reconfigure(config));
    this.configuring = run.catch(() => {});
    return run;
  }

  async #reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const linkChanged =
      previous.url !== config.url ||
      JSON.stringify(previous.headers) !== JSON.stringify(config.headers) ||
      !this.client;
    if (linkChanged) {
      this.#stopLink();
      this.spools.clear();
      this.loaded = false;
      this.version = null;
      this.failure = null;
      this.announced = false;
      this.liveSeen = false;
      this.touched.clear();
      if (config.url) {
        this.client = new SpoolmanClient({
          url: config.url,
          headers: config.headers,
          fetch: this.fetch,
          timeout: this.timings.requestTimeout,
        });
        this.live = new LiveFeed({
          url: config.url,
          headers: config.headers,
          createSocket: this.createSocket,
          timings: this.timings,
        });
        this.live.on('open', () => this.#onLiveOpen());
        this.live.on('close', () => logger.debug('Live feed closed, reconnecting'));
        this.live.on('message', (message) => this.#onMessage(message));
        this.refreshTimer = setInterval(() => this.refresh(), this.timings.refreshInterval);
        this.refreshTimer.unref?.();
        const live = this.live;
        await this.refresh();
        if (this.live === live) {
          live.start();
        }
      } else {
        await this.publishDevices();
      }
    } else {
      // Language or stock option only: same data, new names and texts.
      this.gladys.forgetPublishedStates?.();
      await this.publishDevices();
      await this.publishStates();
    }
    await this.updateConnectionStatus();
    this.refreshWidget();
  }

  /** Gladys reconnected (it may have restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.lastStatus = '';
    await this.reconfigure(config);
    await this.publishStates();
  }

  #stopLink() {
    // A print that just ended still gets its event.
    const fired = [...this.usage.keys()].map((id) => this.#flushUsage(id));
    this.live?.stop();
    this.live = null;
    this.client = null;
    clearInterval(this.refreshTimer);
    clearTimeout(this.debounceTimer);
    this.refreshTimer = null;
    this.debounceTimer = null;
    return Promise.all(fired);
  }

  async stop() {
    const fired = this.#stopLink();
    this.stopped = true;
    clearTimeout(this.widgetTimer);
    await fired;
  }

  #touch(id) {
    this.touchSeq += 1;
    this.touched.set(id, this.touchSeq);
  }

  // --- Reading Spoolman ---------------------------------------------------

  /** Read the whole list (one read at a time; a request during it runs once after). */
  refresh() {
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.refreshing = (async () => {
      do {
        this.refreshAgain = false;
        await this.#refreshOnce();
      } while (this.refreshAgain && !this.stopped);
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async #refreshOnce() {
    const client = this.client;
    if (!client || this.stopped) {
      return;
    }
    let list;
    let mark;
    try {
      if (!this.version) {
        this.version = (await client.info()).version;
      }
      mark = this.touchSeq;
      list = await client.spools();
    } catch (err) {
      if (client !== this.client) {
        return;
      }
      this.#fail(err);
      await this.updateConnectionStatus();
      return;
    }
    if (client !== this.client) {
      return;
    }
    const parsed = list.map(parseSpool).filter(Boolean);
    const firstLoad = !this.loaded;
    const fresher = (id) => (this.touched.get(id) ?? 0) > mark;
    const seen = new Set();
    for (const spool of parsed) {
      seen.add(spool.id);
      if (!fresher(spool.id)) {
        this.#apply(spool, { silent: firstLoad });
      }
    }
    for (const id of [...this.spools.keys()]) {
      if (!seen.has(id) && !fresher(id)) {
        this.#remove(id);
      }
    }
    this.loaded = true;
    const wasFailing = this.failure !== null;
    this.#recover(parsed.length);
    if (wasFailing) {
      // Spoolman came back: the socket may be a dead one that never closed.
      this.live?.restart();
    }
    await this.publishDevices();
    await this.publishStates();
    await this.#publishGone(seen);
    await this.updateConnectionStatus();
    this.refreshWidget();
  }

  #fail(err) {
    const kind = err instanceof SpoolmanError ? err.kind : 'unreachable';
    if (this.failure === null) {
      logger.warn(`Spoolman: ${err.message}`);
    } else {
      logger.debug(`Spoolman still failing: ${err.message}`);
    }
    this.failure = kind;
    if (kind === 'invalid') {
      this.version = null;
    }
  }

  #recover(count) {
    if (this.failure !== null) {
      logger.info(`Spoolman answers again (${count} spools)`);
    } else if (!this.announced) {
      logger.info(`Connected to Spoolman ${this.version} (${count} spools)`);
    }
    this.announced = true;
    this.failure = null;
  }

  #onLiveOpen() {
    if (!this.liveSeen) {
      logger.info('Live updates from Spoolman connected');
    } else {
      logger.debug('Live feed open again');
    }
    this.liveSeen = true;
    // Catch up with what changed while the feed was down.
    this.#scheduleRefresh();
  }

  /**
   * Created spool devices Spoolman no longer has (deleted while the
   * integration was not running, for instance): "Deleted in Spoolman".
   */
  async #publishGone(seen) {
    const prefix = this.gladys.externalId(`${SPOOL_TYPE}:`);
    const label = (STATUS_LABELS[this.language] ?? STATUS_LABELS.en).deleted;
    const states = [];
    for (const device of this.gladys.devices ?? []) {
      const id = device.external_id?.startsWith(prefix)
        ? Number(device.external_id.slice(prefix.length))
        : NaN;
      if (Number.isInteger(id) && !seen.has(id) && !this.spools.has(id)) {
        states.push({
          device_feature_external_id: spoolIds(this.gladys, id).feature('status'),
          text: label,
        });
      }
    }
    await this.#publish(states);
  }

  async #onMessage({ type, resource, payload }) {
    if (resource !== 'spool') {
      // A filament or vendor changed (name, weight, colour): the spools using
      // it get no message of their own.
      if (resource === 'filament' || resource === 'vendor') {
        this.#scheduleRefresh();
      }
      return;
    }
    if (!this.loaded) {
      this.#scheduleRefresh();
      return;
    }
    if (Number.isInteger(payload.id)) {
      this.#touch(payload.id);
    }
    if (type === 'deleted') {
      if (Number.isInteger(payload.id) && this.spools.has(payload.id)) {
        this.#remove(payload.id);
        await this.publishDevices();
      }
    } else {
      const spool = parseSpool(payload);
      if (!spool) {
        return;
      }
      const isNew = !this.spools.has(spool.id);
      const nameChanged = this.spools.get(spool.id)?.name !== spool.name;
      const archivedChanged = this.spools.get(spool.id)?.archived !== spool.archived;
      this.#apply(spool);
      if (isNew || nameChanged || archivedChanged) {
        await this.publishDevices();
      }
    }
    await this.publishStates();
    this.refreshWidget();
  }

  #scheduleRefresh() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.refresh();
    }, this.timings.refreshDebounce);
    this.debounceTimer.unref?.();
  }

  /** Store a fresh spool; detects consumptions and archiving. */
  #apply(spool, { silent = false } = {}) {
    const previous = this.spools.get(spool.id);
    this.spools.set(spool.id, spool);
    if (silent || !previous) {
      return;
    }
    const delta = (spool.usedWeight ?? 0) - (previous.usedWeight ?? 0);
    if (delta > 0.05 && !this.ownUse.get(spool.id)) {
      this.#addUsage(spool.id, delta);
    }
    if (spool.archived && !previous.archived) {
      this.#fireArchived(spool);
    }
  }

  #remove(id) {
    const spool = this.spools.get(id);
    this.#flushUsage(id);
    this.spools.delete(id);
    if (spool && this.#isCreated(spoolIds(this.gladys, id).device)) {
      logger.info(
        `Spool ${id} was deleted in Spoolman; its Gladys device stays until you delete it`,
      );
      void this.#publish(buildSpoolStates(this.gladys, spool, this.language, 'deleted'));
    }
  }

  // --- Scene events ---------------------------------------------------------

  #addUsage(id, grams) {
    const entry = this.usage.get(id) ?? { grams: 0, timer: null };
    entry.grams += grams;
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => this.#flushUsage(id), this.timings.usageSettle);
    entry.timer.unref?.();
    this.usage.set(id, entry);
  }

  #flushUsage(id) {
    const entry = this.usage.get(id);
    if (!entry) {
      return;
    }
    clearTimeout(entry.timer);
    this.usage.delete(id);
    const spool = this.spools.get(id);
    if (!spool || this.stopped) {
      return Promise.resolve();
    }
    const data = {
      ...this.#eventBase(spool),
      used_grams: Math.round(entry.grams * 10) / 10,
      remaining_grams: spool.remainingWeight === null ? null : Math.round(spool.remainingWeight),
      remaining_percent: spool.percent === null ? null : Math.round(spool.percent),
    };
    logger.debug(`Spool ${id}: ${data.used_grams} g used`);
    return this.#fire(TRIGGERS.used, data);
  }

  #fireArchived(spool) {
    this.#flushUsage(spool.id);
    logger.info(`Spool ${spool.id} archived in Spoolman`);
    this.#fire(TRIGGERS.archived, this.#eventBase(spool));
  }

  #eventBase(spool) {
    return {
      device: spoolIds(this.gladys, spool.id).device,
      spool: this.#deviceName(spool),
      material: spool.material,
      location: spool.location,
    };
  }

  async #fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Cannot fire ${key}: ${err.message}`);
    }
  }

  #deviceName(spool) {
    const id = spoolIds(this.gladys, spool.id).device;
    return (this.gladys.devices ?? []).find((d) => d.external_id === id)?.name ?? spool.name;
  }

  // --- Devices and states -------------------------------------------------

  #isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  activeSpools() {
    return [...this.spools.values()].filter((s) => !s.archived).sort((a, b) => a.id - b.id);
  }

  /** The stocks, plus the created stock devices whose material ran out (0). */
  stocks() {
    if (!this.config.materialStock) {
      return [];
    }
    const stock = stockByMaterial(this.spools.values());
    const prefix = this.gladys.externalId(`${STOCK_TYPE}:`);
    for (const device of this.gladys.devices ?? []) {
      const key = device.external_id?.startsWith(prefix)
        ? device.external_id.slice(prefix.length)
        : null;
      if (key && !stock.has(key)) {
        stock.set(key, { key, material: key.toUpperCase(), weight: 0, count: 0, empty: true });
      }
    }
    return [...stock.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  buildDevices() {
    if (!this.loaded) {
      return [];
    }
    const url = this.config.url ?? '';
    return [
      ...this.activeSpools().map((s) => buildSpoolDevice(this.gladys, s, this.language, url)),
      ...this.stocks()
        .filter((stock) => !stock.empty)
        .map((stock) => buildStockDevice(this.gladys, stock, this.language, url)),
    ];
  }

  async publishDevices() {
    if (this.stopped) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(this.buildDevices());
    } catch (err) {
      logger.error('Cannot publish the devices', err);
    }
  }

  /**
   * The states of the devices the user added (Gladys drops the others, and
   * takes 300 states a minute: a large stock must not spend them).
   * @param {string} [only] one device external id
   */
  async publishStates(only) {
    if (!this.loaded || this.stopped) {
      return;
    }
    const wanted = (id) => (only ? id === only : this.#isCreated(id));
    const states = [];
    for (const spool of this.spools.values()) {
      if (wanted(spoolIds(this.gladys, spool.id).device)) {
        states.push(...buildSpoolStates(this.gladys, spool, this.language));
      }
    }
    for (const stock of this.stocks()) {
      if (wanted(stockIds(this.gladys, stock.key).device)) {
        states.push(...buildStockStates(this.gladys, stock));
      }
    }
    await this.#publish(states);
  }

  async #publish(states) {
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeat });
    } catch (err) {
      if (this.publishFailing) {
        logger.debug(`Cannot publish the states: ${err.message}`);
      } else {
        logger.warn(`Cannot publish the states: ${err.message}`);
      }
      this.publishFailing = true;
      return;
    }
    if (this.publishFailing) {
      logger.info('States published again');
    }
    this.publishFailing = false;
  }

  /** The user added a device: states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (!parseDeviceId(this.gladys, device?.external_id)) {
      return;
    }
    this.gladys.forgetPublishedStates?.(device.external_id);
    await this.publishStates(device.external_id);
    this.refreshWidget();
  }

  /** onPoll (the devices are not polled; Spoolman pushes): the states again. */
  async poll(device) {
    if (parseDeviceId(this.gladys, device?.external_id)) {
      await this.publishStates(device.external_id);
    }
  }

  // --- Widget ---------------------------------------------------------------

  /** Nudge the open dashboards, with a trailing call inside the core's 10 s gap. */
  refreshWidget() {
    if (this.stopped) {
      return;
    }
    const wait = this.widgetRefreshAt + this.timings.widgetGap - this.now();
    if (wait <= 0) {
      this.widgetRefreshAt = this.now();
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
      return;
    }
    if (!this.widgetTimer) {
      this.widgetTimer = setTimeout(() => {
        this.widgetTimer = null;
        this.refreshWidget();
      }, wait);
      this.widgetTimer.unref?.();
    }
  }

  // --- Connection status ----------------------------------------------------

  statusMessage() {
    const keys = [];
    if (this.config.urlInvalid) {
      keys.push('invalid');
    } else if (!this.config.url) {
      keys.push('none');
    } else if (this.failure) {
      keys.push(
        {
          unauthorized: 'unauthorized',
          forbidden: 'forbidden',
          invalid: 'invalid_answer',
          not_found: 'invalid_answer',
        }[this.failure] ?? 'unreachable',
      );
    }
    if (this.config.headerInvalid) {
      keys.push('header');
    }
    if (keys.length === 0) {
      return null;
    }
    return Object.fromEntries(
      Object.entries(STATUS_TEXT).map(([language, table]) => [
        language,
        keys.map((key) => table[key]).join(' '),
      ]),
    );
  }

  async updateConnectionStatus() {
    if (this.stopped) {
      return;
    }
    // Nothing to say before the first answer or failure.
    if (this.config.url && !this.loaded && this.failure === null) {
      return;
    }
    const message = this.statusMessage();
    const connected = Boolean(this.config.url) && this.loaded && this.failure === null;
    const fingerprint = JSON.stringify({ connected, message });
    if (fingerprint === this.lastStatus) {
      return;
    }
    this.lastStatus = fingerprint;
    try {
      await this.gladys.setConnectionStatus(connected, message ?? undefined);
    } catch (err) {
      logger.warn(`Cannot set the connection status: ${err.message}`);
    }
  }

  // --- Consumption ----------------------------------------------------------

  /** The spool of a device external id, or a CommandError. */
  spoolOf(externalId) {
    const parsed = parseDeviceId(this.gladys, externalId);
    const spool = parsed?.type === SPOOL_TYPE ? this.spools.get(Number(parsed.id)) : undefined;
    if (!spool) {
      throw new CommandError('unknown_spool', this.language);
    }
    if (spool.archived) {
      throw new CommandError('archived', this.language);
    }
    return spool;
  }

  /**
   * Record a consumption (scene action, widget form). Never fires
   * `filament_used`: a scene reacting to it would loop through here.
   * @returns {Promise<{ spool: object, message: Record<string, string> }>}
   */
  async use(externalId, amount, unit) {
    const spool = this.spoolOf(externalId);
    if (!USE_UNITS.includes(unit)) {
      throw new CommandError('unit', this.language);
    }
    const value = typeof amount === 'string' ? Number(amount.replace(',', '.')) : amount;
    const max = USE_LIMITS[unit];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > max) {
      throw new CommandError('amount', this.language, max);
    }
    if (!this.client) {
      throw new CommandError('unreachable', this.language);
    }
    const client = this.client;
    this.ownUse.set(spool.id, (this.ownUse.get(spool.id) ?? 0) + 1);
    let updated;
    let timedOut = false;
    try {
      updated = parseSpool(
        await client.use(
          spool.id,
          unit === 'grams' ? { weight: value } : { length: Math.round(value * 1000) },
        ),
      );
    } catch (err) {
      logger.warn(`Spool ${spool.id}: consumption refused (${err.message})`);
      const kind = err instanceof SpoolmanError ? err.kind : 'refused';
      timedOut = kind === 'timeout';
      throw new CommandError(
        timedOut ? 'timeout' : kind === 'unreachable' ? 'unreachable' : 'refused',
        this.language,
      );
    } finally {
      const release = () => {
        const left = (this.ownUse.get(spool.id) ?? 1) - 1;
        if (left > 0) {
          this.ownUse.set(spool.id, left);
        } else {
          this.ownUse.delete(spool.id);
        }
      };
      if (timedOut) {
        // Spoolman may still apply it: its late echo is not a print.
        setTimeout(release, this.timings.ownUseGrace).unref?.();
      } else {
        release();
      }
    }
    const current = updated ?? spool;
    if (updated && client === this.client) {
      // Our own consumption: the baseline moves without an event.
      this.#touch(updated.id);
      this.spools.set(updated.id, updated);
      await this.publishStates();
      this.refreshWidget();
    }
    logger.info(`Spool ${spool.id}: ${value} ${unit} recorded`);
    const message = Object.fromEntries(
      Object.entries(USED_TEXT).map(([language, render]) => [
        language,
        render(
          formatAmount(value, unit, language),
          this.#deviceName(current),
          current.remainingWeight === null ? '' : formatGrams(current.remainingWeight, language),
        ).slice(0, 200),
      ]),
    );
    return { spool: current, message };
  }

  // --- "Test the connection" ---------------------------------------------------

  async testReport() {
    const table = (fn) =>
      Object.fromEntries(Object.entries(TEST_TEXT).map(([lang, t]) => [lang, fn(t, lang)]));
    if (!this.client) {
      return Object.fromEntries(
        Object.entries(STATUS_TEXT).map(([lang, t]) => [
          lang,
          this.config.urlInvalid ? t.invalid : t.none,
        ]),
      );
    }
    try {
      const { version } = await this.client.info();
      const spools = (await this.client.spools()).map(parseSpool).filter(Boolean);
      const count = spools.filter((s) => !s.archived).length;
      const live = this.live?.open === true;
      // Clears a failure status the regular refresh has not cleared yet.
      await this.refresh();
      return table((t) => [t.ok(version, count), live ? t.live : t.noLive].join('\n'));
    } catch (err) {
      this.#fail(err);
      await this.updateConnectionStatus();
      return this.statusMessage() ?? table((t) => t.noLive);
    }
  }
}
