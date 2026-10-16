import { test } from 'node:test';
import assert from 'node:assert/strict';
import { materialKey, parseSpool, spoolName, stockByMaterial } from '../src/spoolman/model.js';
import { SPOOLS } from './helpers/fakeSpoolman.js';

const spools = SPOOLS.map(parseSpool);

test('a spool of Spoolman 0.27.0: weights, percentage, metres, location, dates', () => {
  const [one] = spools;
  assert.equal(one.id, 1);
  assert.equal(one.name, 'Prusament Galaxy Black PLA #1');
  assert.equal(one.vendor, 'Prusament');
  assert.equal(one.material, 'PLA');
  assert.equal(one.location, 'Atelier');
  assert.equal(one.colorHex, '000000');
  assert.equal(one.initialWeight, 1000);
  assert.ok(Math.abs(one.percent - one.remainingWeight / 10) < 1e-9);
  // Millimetres in the API.
  assert.ok(Math.abs(one.remainingLength - SPOOLS[0].remaining_length / 1000) < 1e-9);
  assert.match(one.lastUsed, /^2026-10-16T/);
  assert.equal(one.archived, false);
});

test('a filament without weight: no remaining weight nor percentage, no false zero', () => {
  const tpu = spools.find((s) => s.material === 'TPU');
  assert.equal(tpu.remainingWeight, null);
  assert.equal(tpu.percent, null);
  assert.equal(tpu.remainingLength, null);
  assert.equal(tpu.usedWeight, SPOOLS[2].used_weight);
  assert.equal(tpu.name, 'Generic TPU #3', 'no vendor, material already in the name');
});

test('archived spools are marked, unusable entries dropped', () => {
  assert.equal(spools.find((s) => s.id === 2).archived, true);
  assert.equal(parseSpool({ id: 'x' }), null);
  assert.equal(parseSpool(null), null);
  assert.equal(parseSpool({ id: 7 }).name, 'Spool #7');
});

test('names keep the vendor, the filament and the material once', () => {
  assert.equal(
    spoolName({ id: 3, vendor: 'eSUN', filament: 'PLA+ Blue', material: 'PLA' }),
    'eSUN PLA+ Blue #3',
  );
  assert.equal(spoolName({ id: 3, vendor: '', filament: 'Blue', material: 'ASA' }), 'Blue ASA #3');
});

test('material keys are stable ids', () => {
  assert.equal(materialKey('PLA'), 'pla');
  assert.equal(materialKey(' PETG-CF '), 'petg-cf');
  assert.equal(materialKey('PLA+'), 'pla-plus');
  assert.equal(materialKey('Nylon (PA12)'), 'nylon-pa12');
  assert.equal(materialKey(''), null);
});

test('stock by material: active spools only, unknown weights count as zero', () => {
  const stock = stockByMaterial(spools);
  assert.deepEqual([...stock.keys()].sort(), ['petg', 'pla', 'tpu']);
  const petg = stock.get('petg');
  assert.equal(petg.count, 1, 'the archived PETG spool is not in stock');
  assert.equal(stock.get('tpu').weight, 0);
});
