// What reaches `docker logs` at the default level (info): the lifecycle only.
// A normal cycle (live updates, published states, refreshes) writes nothing at
// info, an outage logs one line, and its recovery one more.
//
// The SDK logger writes through console.log (debug, info) and console.error
// (warn, error), re-reading LOG_LEVEL on every call: the tests capture both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settle, wait } from './helpers/fakeSpoolman.js';
import { createAll, createWorld } from './helpers/world.js';

function captureLogs(t) {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'debug';
  const captured = [];
  const record = (...args) => captured.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    if (previous === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = previous;
    }
  });
  return {
    all: () => [...captured],
    lines: () =>
      captured.filter((line) => !line.includes('[DEBUG]') && line.includes('[spoolman-')),
    reset: () => captured.splice(0),
  };
}

test('a normal cycle writes nothing at info: live updates, refreshes, polls', async (t) => {
  const logs = captureLogs(t);
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world.fake);
  const start = logs.lines();
  assert.ok(
    start.some((line) => /Connected to Spoolman 0\.27\.0 \(4 spools\)/.test(line)),
    start.join('\n'),
  );
  assert.ok(start.length <= 2, start.join('\n'));
  logs.reset();
  const before = world.fake.states.length;
  for (let i = 0; i < 10; i += 1) {
    world.server.consume(1, 0.8);
    await settle(5);
  }
  await wait(60);
  await world.hub.refresh();
  await world.fake.poll(world.fake.discoveredDevices[0]);
  world.server.push('updated', 'vendor', { id: 1, name: 'Prusament' });
  await wait(20);
  await settle();
  assert.ok(world.fake.states.length > before, 'states were published');
  assert.equal(world.fake.sceneEvents.length, 1);
  assert.deepEqual(logs.lines(), [], 'nothing at info or above');
});

test('Spoolman down: one warning, nothing per attempt, one line when it is back', async (t) => {
  const logs = captureLogs(t);
  const world = await createWorld();
  t.after(() => world.app.stop());
  logs.reset();
  world.server.goDown();
  for (let i = 0; i < 4; i += 1) {
    await world.hub.refresh();
  }
  await wait(150);
  const down = logs.lines();
  assert.equal(down.length, 1, down.join('\n'));
  assert.match(down[0], /\[WARN\].*Spoolman unreachable \(ECONNREFUSED\)/);
  logs.reset();
  world.server.goUp();
  await wait(150);
  await settle(40);
  const back = logs.lines();
  assert.equal(back.length, 1, back.join('\n'));
  assert.match(back[0], /\[INFO\].*Spoolman answers again \(4 spools\)/);
});

test('no credential ever reaches the logs', async (t) => {
  const logs = captureLogs(t);
  const world = await createWorld({
    config: {
      url: '192.0.2.20',
      username: 'gladys',
      password: 'hunter2',
      extra_header: 'X-Token: s3cr3t',
    },
  });
  t.after(() => world.app.stop());
  world.server.goDown();
  await world.hub.refresh();
  const all = logs.all().join('\n');
  for (const secret of ['hunter2', 's3cr3t', Buffer.from('gladys:hunter2').toString('base64')]) {
    assert.ok(!all.includes(secret), secret);
  }
});
