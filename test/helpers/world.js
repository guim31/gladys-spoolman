// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys (a real GladysIntegration on an
// in-memory transport), the integration wired on it by registerHandlers, and
// a fake Spoolman.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { HOST, createSpoolman, settle } from './fakeSpoolman.js';

export const FAST_TIMINGS = {
  refreshInterval: 60_000,
  refreshDebounce: 5,
  usageSettle: 30,
  widgetGap: 0,
  reconnectMin: 10,
  reconnectMax: 50,
  ownUseGrace: 100,
  requestTimeout: 200,
};

export async function createWorld({
  server = createSpoolman(),
  config = { url: HOST },
  devices = [],
  connect = true,
  timings = FAST_TIMINGS,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    fetch: server.fetch,
    createSocket: server.createSocket,
    timings,
  });
  if (connect) {
    await gladys.connect();
    await settle(40);
  }
  return { gladys, app, hub: app.hub, server, fake: gladys.fake };
}

export const spoolDevice = (id) => `ext:test-integration:spool:${id}`;
export const spoolFeature = (id, key) => `${spoolDevice(id)}:${key}`;
export const stockDevice = (key) => `ext:test-integration:material:${key}`;

/** Add every discovered device to Gladys, as the user would. */
export async function createAll(fake) {
  for (const device of fake.discoveredDevices) {
    await fake.deviceCreated(device);
  }
  await settle();
}
