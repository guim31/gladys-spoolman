import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createSpoolman, SPOOLS, settle } from './helpers/fakeSpoolman.js';
import { createWorld, spoolDevice } from './helpers/world.js';

const get = async (fake, settings = {}, language = 'en') => {
  const ack = await fake.widgetGet('spools', { settings, language });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content ?? ack.data;
};

test('the widget fits the core vocabulary and budget, emptiest spool first', async (t) => {
  const { fake, app } = await createWorld();
  t.after(() => app.stop());
  const content = await get(fake);
  assert.deepEqual(validateWidgetContent(content), []);
  const types = content.components.map((c) => c.type);
  assert.deepEqual(types, ['value', 'value', 'value', 'card-list', 'button']);
  const [stock, count, low, list, button] = content.components;
  assert.equal(stock.unit, 'kg');
  assert.equal(count.value, 3);
  assert.equal(low.value, 0);
  assert.equal(list.items[0].title, 'Prusament Galaxy Black PLA #1', 'lowest percentage first');
  assert.equal(list.items.at(-1).title, 'Generic TPU #3', 'unknown percentage last');
  assert.equal(list.items[0].badge.color, 'success');
  // The form lists the spools in use, never the archived one.
  const spoolField = button.action.fields.find((f) => f.key === 'spool');
  assert.deepEqual(
    spoolField.options.map((o) => o.value),
    ['1', '4', '3'],
  );
});

test('filters and the low threshold', async (t) => {
  const spools = structuredClone(SPOOLS);
  spools[0].remaining_weight = 80; // 8 %
  const { fake, app } = await createWorld({ server: createSpoolman({ spools }) });
  t.after(() => app.stop());
  const pla = await get(fake, { material: 'pla', low_threshold: 20 });
  assert.equal(pla.components[1].value, 1);
  assert.equal(pla.components[2].value, 1);
  assert.equal(pla.components[2].color, 'warning');
  assert.equal(pla.components[3].items[0].badge.color, 'danger');
  const shelf = await get(fake, { location: 'shelf' });
  assert.deepEqual(
    shelf.components[3].items.map((i) => i.title),
    ['eSUN PETG+ Red #4'],
  );
  const none = await get(fake, { material: 'ASA' }, 'de');
  assert.deepEqual(validateWidgetContent(none), []);
  assert.match(none.components[0].text, /Keine Spule/);
});

test('the "Log usage" form records a consumption and answers a toast', async (t) => {
  const { fake, app, server } = await createWorld();
  t.after(() => app.stop());
  const before = server.spool(4).remaining_weight;
  const ack = await fake.widgetAction(
    'spools',
    'use',
    {},
    {
      settings: {},
      values: { spool: '4', amount: 25, unit: 'grams' },
    },
  );
  assert.equal(ack.success, true, ack.error);
  await settle();
  assert.equal(server.spool(4).remaining_weight, before - 25);
  const toast = ack.data.message ?? ack.data;
  assert.match(toast.en, /^25 g recorded on eSUN PETG\+ Red #4, 975 g left\.$/);
  assert.ok(app.hub.spools.get(4).remainingWeight === before - 25);
  // Without its form (Gladys older than 5.2.0): refused, nothing recorded.
  const old = await fake.widgetAction('spools', 'use', {}, { settings: {} });
  assert.equal(old.success, false);
  assert.equal(server.spool(4).remaining_weight, before - 25);
  assert.equal(fake.sceneEvents.length, 0);
  assert.ok(spoolDevice(4));
});

test('before Spoolman answers: a waiting text', async (t) => {
  const server = createSpoolman();
  server.goDown();
  const { fake, app } = await createWorld({ server });
  t.after(() => app.stop());
  const content = await get(fake, {}, 'fr');
  assert.deepEqual(validateWidgetContent(content), []);
  assert.match(content.components[0].text, /En attente de Spoolman/);
});

test('long names keep their spool number in the form and the list', async () => {
  const { shortName } = await import('../src/widgets.js');
  const spool = { id: 12, name: 'Polymaker PolyTerra Charcoal Black PLA #12' };
  assert.equal(shortName(spool, 40), 'Polymaker PolyTerra Charcoal Black P #12');
  assert.equal(shortName(spool, 40).length, 40);
  assert.equal(shortName({ id: 1, name: 'eSUN PLA #1' }, 40), 'eSUN PLA #1');
});
