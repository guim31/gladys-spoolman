// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, LANGUAGES } from '../src/config.js';
import { TRIGGERS, USE_LIMITS, USE_UNITS, WIDGET_KEY } from '../src/hub.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { DEFAULT_LOW_THRESHOLD, WIDGETS } from '../src/widgets.js';
import { settle, wait } from './helpers/fakeSpoolman.js';
import { createAll, createWorld, spoolDevice } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

test('identity: name, image, local transport, appliances category', () => {
  assert.equal(manifest.name, 'Spoolman');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-spoolman:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-spoolman/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['local']);
  assert.deepEqual(manifest.categories, ['appliances']);
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the widget form needs Gladys 5.2.0 (buttons with fields, #3168)', () => {
  assert.equal(manifest.gladys_version, '>=5.2.0');
});

test('config_schema: the defaults and options of the code', () => {
  const keys = manifest.config_schema.filter((f) => f.type !== 'section').map((f) => f.key);
  assert.deepEqual([...keys].sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `default of ${field.key}`);
    }
  }
  const field = (key) => manifest.config_schema.find((f) => f.key === key);
  assert.equal(field('password').type, 'secret');
  assert.equal(field('extra_header').type, 'secret');
  assert.equal(field('material_stock').type, 'boolean');
  assert.deepEqual(
    field('language').options.map((o) => o.value),
    LANGUAGES,
  );
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('every action, scene action and widget has a handler, and vice versa', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const fake = world.fake;
  assert.match((await fake.action('nope')).error, /not implemented/i);
  for (const action of manifest.actions) {
    const ack = await fake.action(action.key, {});
    assert.equal(ack.success, true, `action ${action.key}: ${ack.error}`);
  }
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  assert.deepEqual(Object.keys(WIDGETS), [WIDGET_KEY]);
  assert.equal((await fake.widgetGet(WIDGET_KEY, { settings: {} })).success, true);
});

test('scene action fields and outputs are the ones the code reads and returns', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const action = manifest.scene_actions.find((a) => a.key === 'use_filament');
  assert.deepEqual(keysOf(action.fields), ['device', 'amount', 'unit']);
  assert.deepEqual(
    action.fields.find((f) => f.key === 'unit').options.map((o) => o.value),
    USE_UNITS,
  );
  assert.equal(action.fields.find((f) => f.key === 'amount').max, USE_LIMITS.grams);
  const ack = await world.fake.sceneAction('use_filament', {
    device: spoolDevice(1),
    amount: 3,
    unit: 'grams',
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(Object.keys(ack.data.outputs).sort(), keysOf(action.outputs).sort());
});

test('the scene triggers the hub fires are declared, with exactly their data', async (t) => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(TRIGGERS).sort());
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world.fake);
  world.server.consume(1, 4);
  await settle();
  await wait(60);
  world.server.archive(1);
  await settle();
  const events = world.fake.sceneEvents;
  assert.deepEqual(
    events.map((e) => e.key),
    ['filament_used', 'spool_archived'],
  );
  for (const trigger of manifest.scene_triggers) {
    const event = events.find((e) => e.key === trigger.key);
    const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
    assert.deepEqual(Object.keys(event.data).sort(), declared.sort(), trigger.key);
    for (const variable of trigger.variables) {
      const value = event.data[variable.key];
      assert.equal(typeof value, variable.type === 'number' ? 'number' : 'string', variable.key);
    }
  }
});

test('the widget settings match the code defaults', () => {
  const settings = manifest.widgets[0].settings;
  assert.equal(settings.find((s) => s.key === 'low_threshold').default, DEFAULT_LOW_THRESHOLD);
});

test('dynamic selects declare a source and no static options', () => {
  for (const field of allFields.filter((f) => f.source !== undefined)) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, field.key);
  }
});

test('number fields have integer bounds and defaults (the form has no step)', () => {
  for (const field of allFields.filter((f) => f.type === 'number')) {
    for (const key of ['min', 'max', 'default']) {
      if (field[key] !== undefined) {
        assert.ok(Number.isInteger(field[key]), `${field.key}.${key}`);
      }
    }
  }
});

test('actions declare no secret field, no required field (Gladys#3154/#3155)', () => {
  for (const action of manifest.actions ?? []) {
    for (const field of action.fields ?? []) {
      assert.notEqual(field.type, 'secret');
      assert.notEqual(field.required, true);
    }
  }
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});
