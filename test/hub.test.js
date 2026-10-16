// The hub against a fake Spoolman (recorded bodies of Spoolman 0.27.0) and
// the SDK's fake Gladys: discovery, states, live updates, scene events,
// consumptions, outages and credentials.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOST, SPOOLS, createSpoolman, settle, wait } from './helpers/fakeSpoolman.js';
import { createAll, createWorld, spoolDevice, spoolFeature, stockDevice } from './helpers/world.js';

const ids = (fake) => fake.discoveredDevices.map((d) => d.external_id);

test('discovery: one device per spool in use and one per material, nothing archived', async (t) => {
  const { fake, app } = await createWorld();
  t.after(() => app.stop());
  assert.deepEqual(ids(fake), [
    spoolDevice(1),
    spoolDevice(3),
    spoolDevice(4),
    stockDevice('petg'),
    stockDevice('pla'),
    stockDevice('tpu'),
  ]);
  const one = fake.discoveredDevices[0];
  assert.equal(one.name, 'Prusament Galaxy Black PLA #1');
  assert.equal(one.should_poll, false);
  assert.equal(one.poll_frequency, undefined);
  assert.deepEqual(
    one.params.map((p) => p.name),
    ['SPOOLMAN_URL', 'SPOOLMAN_SPOOL_ID', 'SPOOLMAN_LOCATION', 'SPOOLMAN_COLOR'],
  );
  assert.equal(
    one.features.find((f) => f.external_id.endsWith(':remaining_weight')).name,
    'Poids restant (g)',
  );
  assert.deepEqual(fake.connectionStatus, { connected: true });
  // Nothing added to Gladys yet: no state spent on the 300-a-minute budget.
  assert.equal(fake.states.length, 0);
});

test('the stock devices are optional', async (t) => {
  const { fake, app } = await createWorld({ config: { url: HOST, material_stock: false } });
  t.after(() => app.stop());
  assert.deepEqual(ids(fake), [spoolDevice(1), spoolDevice(3), spoolDevice(4)]);
});

test('adding a device publishes its states at once, and nudges the widget', async (t) => {
  const { fake, app } = await createWorld();
  t.after(() => app.stop());
  const refreshes = fake.widgetRefreshes.length;
  await fake.deviceCreated(fake.discoveredDevices[0]);
  await settle();
  const spool = SPOOLS[0];
  assert.equal(
    fake.lastState(spoolFeature(1, 'remaining_weight')),
    Math.round(spool.remaining_weight),
  );
  assert.equal(fake.lastState(spoolFeature(1, 'used_weight')), Math.round(spool.used_weight));
  assert.equal(
    fake.lastState(spoolFeature(1, 'remaining_percent')),
    Math.round(spool.remaining_weight) / 10,
  );
  assert.equal(
    fake.lastState(spoolFeature(1, 'remaining_length')),
    Math.round(spool.remaining_length / 1000),
  );
  assert.equal(fake.lastState(spoolFeature(1, 'status')), 'En service');
  assert.match(fake.lastState(spoolFeature(1, 'last_used')), /^16\/10\/2026 \d\d:\d\d$/);
  assert.ok(fake.widgetRefreshes.length > refreshes);
  // The other devices were not added: nothing for them.
  assert.equal(fake.lastState(spoolFeature(3, 'used_weight')), undefined);

  await fake.deviceCreated(
    fake.discoveredDevices.find((d) => d.external_id === stockDevice('pla')),
  );
  await settle();
  assert.equal(fake.lastState(`${stockDevice('pla')}:spool_count`), 1);
  assert.equal(
    fake.lastState(`${stockDevice('pla')}:remaining_weight`),
    Math.round(spool.remaining_weight),
  );
});

test('a filament without weight publishes no weight, and "never used"', async (t) => {
  const spools = structuredClone(SPOOLS);
  delete spools[2].last_used;
  const { fake, app } = await createWorld({ server: createSpoolman({ spools }) });
  t.after(() => app.stop());
  await fake.deviceCreated(fake.discoveredDevices.find((d) => d.external_id === spoolDevice(3)));
  await settle();
  assert.equal(fake.lastState(spoolFeature(3, 'remaining_weight')), undefined);
  assert.equal(fake.lastState(spoolFeature(3, 'remaining_percent')), undefined);
  assert.equal(fake.lastState(spoolFeature(3, 'used_weight')), Math.round(SPOOLS[2].used_weight));
  assert.equal(fake.lastState(spoolFeature(3, 'last_used')), 'Jamais');
});

test('a print consuming in small steps: live states, then one filament_used event', async (t) => {
  const { fake, app, server } = await createWorld();
  t.after(() => app.stop());
  await createAll(fake);
  const before = server.spool(1).remaining_weight;
  for (let i = 0; i < 5; i += 1) {
    server.consume(1, 1.5);
    await settle();
  }
  assert.equal(fake.lastState(spoolFeature(1, 'remaining_weight')), Math.round(before - 7.5));
  assert.equal(fake.sceneEvents.length, 0, 'nothing while the print goes on');
  await wait(60);
  assert.equal(fake.sceneEvents.length, 1);
  const [event] = fake.sceneEvents;
  assert.equal(event.key, 'filament_used');
  assert.deepEqual(event.data, {
    device: spoolDevice(1),
    spool: 'Prusament Galaxy Black PLA #1',
    material: 'PLA',
    location: 'Atelier',
    used_grams: 7.5,
    remaining_grams: Math.round(before - 7.5),
    remaining_percent: Math.round((before - 7.5) / 10),
  });
  // The stock follows.
  assert.equal(fake.lastState(`${stockDevice('pla')}:remaining_weight`), Math.round(before - 7.5));
});

test('a consumption recorded by the integration itself fires no event (no loop)', async (t) => {
  const { fake, app, server } = await createWorld();
  t.after(() => app.stop());
  await createAll(fake);
  const before = server.spool(1).remaining_weight;
  const ack = await fake.sceneAction('use_filament', {
    device: spoolDevice(1),
    amount: 12,
    unit: 'grams',
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    remaining_grams: Math.round(before - 12),
    remaining_percent: Math.round((before - 12) / 10),
  });
  const metres = await fake.sceneAction('use_filament', {
    device: spoolDevice(1),
    amount: 2,
    unit: 'meters',
  });
  assert.equal(metres.success, true, metres.error);
  assert.equal(server.requests.filter((r) => r.method === 'PUT').length, 2);
  await wait(60);
  assert.deepEqual(fake.sceneEvents, []);
  assert.ok(fake.lastState(spoolFeature(1, 'remaining_weight')) < Math.round(before - 12));
});

test('a consumption is refused with a clear message', async (t) => {
  const { fake, app, server } = await createWorld({ config: { url: HOST, language: 'en' } });
  t.after(() => app.stop());
  const cases = [
    [{ device: stockDevice('pla'), amount: 5, unit: 'grams' }, /Unknown spool/],
    [{ device: spoolDevice(2), amount: 5, unit: 'grams' }, /archived/],
    [{ device: spoolDevice(99), amount: 5, unit: 'grams' }, /Unknown spool/],
    [{ device: spoolDevice(1), amount: 0, unit: 'grams' }, /between 1 and 5000/],
    [{ device: spoolDevice(1), amount: 6000, unit: 'meters' }, /between 1 and 5000/],
    [{ device: spoolDevice(1), amount: 0.5, unit: 'grams' }, /between 1 and 5000/],
    [{ device: spoolDevice(1), amount: -5, unit: 'grams' }, /between 1 and 5000/],
    [{ device: spoolDevice(1), amount: 5, unit: 'kg' }, /grams or metres/],
  ];
  for (const [fields, message] of cases) {
    const ack = await fake.sceneAction('use_filament', fields);
    assert.equal(ack.success, false, JSON.stringify(fields));
    assert.match(ack.error, message);
  }
  assert.equal(server.requests.filter((r) => r.method === 'PUT').length, 0);
  server.goDown();
  const ack = await fake.sceneAction('use_filament', {
    device: spoolDevice(1),
    amount: 5,
    unit: 'grams',
  });
  assert.match(ack.error, /does not answer: nothing was recorded/);
});

test('archiving a spool: an event, out of Discovery, "Archived" on its device', async (t) => {
  const { fake, app, server } = await createWorld();
  t.after(() => app.stop());
  await createAll(fake);
  server.archive(4);
  await settle();
  assert.deepEqual(
    fake.sceneEvents.map((e) => e.key),
    ['spool_archived'],
  );
  assert.deepEqual(fake.sceneEvents[0].data, {
    device: spoolDevice(4),
    spool: 'eSUN PETG+ Red #4',
    material: 'PETG',
    location: 'Shelf',
  });
  assert.ok(!ids(fake).includes(spoolDevice(4)));
  assert.equal(fake.lastState(spoolFeature(4, 'status')), 'Archivée');
  // No PETG left in stock: the created stock device goes to zero.
  assert.equal(fake.lastState(`${stockDevice('petg')}:spool_count`), 0);
  assert.equal(fake.lastState(`${stockDevice('petg')}:remaining_weight`), 0);
});

test('a spool deleted in Spoolman: its created device says so', async (t) => {
  const { fake, app, server } = await createWorld();
  t.after(() => app.stop());
  await createAll(fake);
  server.remove(3);
  await settle();
  assert.ok(!ids(fake).includes(spoolDevice(3)));
  assert.equal(fake.lastState(spoolFeature(3, 'status')), 'Supprimée de Spoolman');
});

test('a new spool appears at once; a filament change reloads the list', async (t) => {
  const { fake, app, server } = await createWorld();
  t.after(() => app.stop());
  server.add({ ...structuredClone(SPOOLS[3]), id: 5, location: 'Dry box' });
  await settle();
  assert.ok(ids(fake).includes(spoolDevice(5)));
  for (const spool of server.spools.filter((s) => s.filament.id === 2)) {
    spool.filament.name = 'PETG+ Fire Red';
  }
  server.push('updated', 'filament', { ...server.spools[3].filament });
  await wait(30);
  await settle();
  assert.equal(
    fake.discoveredDevices.find((d) => d.external_id === spoolDevice(4)).name,
    'eSUN PETG+ Fire Red #4',
  );
});

test('Spoolman down then back: status, live feed reconnected, changes caught up', async (t) => {
  const { fake, app, server, hub } = await createWorld();
  t.after(() => app.stop());
  await createAll(fake);
  server.goDown();
  await hub.refresh();
  assert.equal(fake.connectionStatus.connected, false);
  assert.match(fake.connectionStatus.message.en, /does not answer/);
  // Consumed while the integration could not see it.
  server.goUp();
  server.consume(1, 20);
  server.goDown();
  server.goUp();
  const opened = server.socketsOpened;
  await wait(150);
  await settle(40);
  assert.ok(server.socketsOpened > opened, 'the feed reconnects by itself');
  assert.equal(server.sockets.size, 1);
  assert.deepEqual(fake.connectionStatus, { connected: true });
  assert.equal(
    fake.lastState(spoolFeature(1, 'remaining_weight')),
    Math.round(server.spool(1).remaining_weight),
  );
  await wait(60);
  assert.equal(fake.sceneEvents.at(-1)?.data.used_grams, 20);
});

test('proxy credentials go on every request and on the WebSocket', async (t) => {
  const auth = `Basic ${Buffer.from('gladys:pw').toString('base64')}`;
  const server = createSpoolman({ auth });
  const { fake, app } = await createWorld({
    server,
    config: { url: HOST, username: 'gladys', password: 'pw', extra_header: 'X-Token: abc' },
  });
  t.after(() => app.stop());
  assert.deepEqual(fake.connectionStatus, { connected: true });
  assert.ok(server.requests.every((r) => r.headers.Authorization === auth));
  assert.ok(server.requests.every((r) => r.headers['X-Token'] === 'abc'));
  assert.equal(server.sockets.size, 1);
  assert.equal([...server.sockets][0].init.headers.Authorization, auth);
  assert.equal([...server.sockets][0].url, `ws://${HOST}:7912/api/v1/`);
});

test('wrong credentials, a proxy login page, a missing or invalid address: a clear status', async (t) => {
  const auth = `Basic ${Buffer.from('gladys:pw').toString('base64')}`;
  const refused = await createWorld({
    server: createSpoolman({ auth }),
    config: { url: HOST, language: 'en' },
  });
  t.after(() => refused.app.stop());
  assert.equal(refused.fake.connectionStatus.connected, false);
  assert.match(refused.fake.connectionStatus.message.en, /401/);

  const html = createSpoolman();
  html.override = { html: true };
  const login = await createWorld({ server: html, config: { url: HOST, language: 'en' } });
  t.after(() => login.app.stop());
  assert.match(login.fake.connectionStatus.message.en, /does not answer like Spoolman/);

  const none = await createWorld({ config: {} });
  t.after(() => none.app.stop());
  assert.deepEqual(none.fake.discoveredDevices, []);
  assert.equal(none.fake.connectionStatus.connected, false);
  assert.match(none.fake.connectionStatus.message.fr, /Saisissez l'adresse/);

  const invalid = await createWorld({ config: { url: 'ftp://x', extra_header: 'nope' } });
  t.after(() => invalid.app.stop());
  assert.match(invalid.fake.connectionStatus.message.en, /not valid.*extra header/);
});

test('a new language renames the discovered features; a Gladys restart re-sends everything', async (t) => {
  const { fake, app, gladys } = await createWorld();
  t.after(() => app.stop());
  await createAll(fake);
  await fake.configUpdated({ url: HOST, language: 'en' });
  await settle();
  const one = fake.discoveredDevices[0];
  assert.equal(one.features.find((f) => f.external_id.endsWith(':status')).name, 'Status');
  assert.equal(fake.lastState(spoolFeature(1, 'status')), 'In use');
  const count = fake.states.length;
  await gladys.disconnect();
  await gladys.connect();
  await settle(40);
  assert.ok(fake.states.length > count, 'states published again after the reconnection');
});

/** Hold the answers of GET /spool until release() (each one with the data of its asking). */
function holdList(server) {
  let release;
  server.listGate = new Promise((resolve) => {
    release = resolve;
  });
  return () => {
    server.listGate = null;
    release();
  };
}

test('an old REST answer never overwrites newer live data (no double count, no loop)', async (t) => {
  const { fake, app, server, hub } = await createWorld();
  t.after(() => app.stop());
  await createAll(fake);
  // A refresh asked now, answered after a print, an own use and an archive.
  const release = holdList(server);
  const stale = hub.refresh();
  await settle();
  server.consume(1, 5);
  await settle();
  server.consume(1, 5);
  await settle();
  const ack = await fake.sceneAction('use_filament', {
    device: spoolDevice(3),
    amount: 12,
    unit: 'grams',
  });
  assert.equal(ack.success, true, ack.error);
  server.archive(4);
  await settle();
  release();
  await stale;
  await settle();
  assert.equal(hub.spools.get(1).usedWeight, server.spool(1).used_weight);
  assert.equal(hub.spools.get(4).archived, true);
  assert.ok(!ids(fake).includes(spoolDevice(4)), 'the archived spool does not come back');
  // A fresh refresh finds nothing new to count.
  await hub.refresh();
  await wait(60);
  const used = fake.sceneEvents.filter((e) => e.key === 'filament_used');
  assert.deepEqual(
    used.map((e) => [e.data.device, e.data.used_grams]),
    [[spoolDevice(1), 10]],
  );
  assert.equal(fake.sceneEvents.filter((e) => e.key === 'spool_archived').length, 1);
});

test('the address changes during the first read: no crash, the new link only', async (t) => {
  const server = createSpoolman();
  const release = holdList(server);
  const { fake, app, hub, gladys } = await createWorld({ server, connect: false });
  t.after(() => app.stop());
  const connecting = gladys.connect();
  await settle();
  const cleared = fake.configUpdated({});
  release();
  await connecting;
  await cleared;
  await settle();
  assert.equal(hub.live, null);
  assert.equal(server.sockets.size, 0);
  assert.match(fake.connectionStatus.message.en, /Enter the address/);
});

test('a consumption that times out says it may be recorded, and its echo fires nothing', async (t) => {
  const { fake, app, server } = await createWorld({ config: { url: HOST, language: 'en' } });
  t.after(() => app.stop());
  await createAll(fake);
  server.hangUse = true;
  const ack = await fake.sceneAction('use_filament', {
    device: spoolDevice(1),
    amount: 7,
    unit: 'grams',
  });
  assert.equal(ack.success, false);
  assert.match(ack.error, /may be recorded/);
  await wait(60);
  assert.deepEqual(fake.sceneEvents, []);
});

test('a spool deleted while the integration was off shows "Deleted in Spoolman"', async (t) => {
  const { fake, app } = await createWorld({
    devices: [{ external_id: spoolDevice(42), name: 'Old spool', features: [] }],
  });
  t.after(() => app.stop());
  assert.equal(fake.lastState(spoolFeature(42, 'status')), 'Supprimée de Spoolman');
});

test('a print ending just before the spool is deleted still gets its event', async (t) => {
  const { fake, app, server } = await createWorld();
  t.after(() => app.stop());
  server.consume(3, 4);
  await settle();
  server.remove(3);
  await settle();
  assert.deepEqual(
    fake.sceneEvents.map((e) => [e.key, e.data.used_grams]),
    [['filament_used', 4]],
  );
});
