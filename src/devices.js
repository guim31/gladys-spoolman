// -----------------------------------------------------------------------------
// Spoolman spools and material stocks -> Gladys devices, and their states.
//
// Couples chosen among those the Gladys front knows (test/gladys-rules.test.js):
// - weights: counter-sensor/integer, unit in the name. Gladys has no gram
//   unit; a whole number of grams is precise enough for a spool;
// - remaining percentage: level-sensor/liquid-level-percent, the only
//   read-only percent couple with a label (the precedent of gladys-ipp's ink
//   levels), so "remaining < 10 %" is a plain device-state scene;
// - remaining length: distance-sensor/decimal in metres;
// - last use, status: text/text (two texts: the dashboard shows their names).
// Every feature is read only: a consumption goes through the scene action or
// the widget, never a dashboard slider.
//
// The device of a spool is keyed on its Spoolman id (`spool:<id>`), the one
// of a stock on its material (`material:pla`): ids are forever.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
} from '@gladysassistant/integration-sdk';
import { NAMES, NEVER_USED, STATUS_LABELS, formatDate } from './texts.js';

export const SPOOL_TYPE = 'spool';
export const STOCK_TYPE = 'material';

const MAX_SPOOL_GRAMS = 100_000; // a 10 kg spool, generously
const MAX_USED_GRAMS = 1_000_000;
const MAX_METRES = 100_000;
const MAX_STOCK_GRAMS = 10_000_000;
const MAX_SPOOLS = 10_000;

export const spoolIds = (gladys, id) => gladys.externalIds(SPOOL_TYPE, String(id));
export const stockIds = (gladys, key) => gladys.externalIds(STOCK_TYPE, key);

const readOnly = (ids, key, name, fields) => ({
  name,
  external_id: ids.feature(key),
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...fields,
});

const grams = (max) => ({ category: CAT.COUNTER_SENSOR, type: TYPE.SENSOR.INTEGER, min: 0, max });
const text = { category: CAT.TEXT, type: TYPE.TEXT.TEXT, min: 0, max: 0, keep_history: false };

/**
 * @param {object} gladys
 * @param {object} spool parseSpool()
 * @param {string} language
 * @param {string} url Spoolman base URL (a device param, shown in Gladys)
 */
export function buildSpoolDevice(gladys, spool, language, url) {
  const names = NAMES[language] ?? NAMES.en;
  const ids = spoolIds(gladys, spool.id);
  const params = [
    { name: 'SPOOLMAN_URL', value: url },
    { name: 'SPOOLMAN_SPOOL_ID', value: String(spool.id) },
  ];
  if (spool.location) {
    params.push({ name: 'SPOOLMAN_LOCATION', value: spool.location.slice(0, 100) });
  }
  if (spool.colorHex) {
    params.push({ name: 'SPOOLMAN_COLOR', value: `#${spool.colorHex.slice(0, 40)}` });
  }
  return {
    name: spool.name,
    external_id: ids.device,
    model: [spool.material, spool.filament].filter(Boolean).join(' ').slice(0, 60) || 'Spoolman',
    should_poll: false,
    features: [
      readOnly(ids, 'remaining_weight', names.remaining_weight, grams(MAX_SPOOL_GRAMS)),
      readOnly(ids, 'remaining_percent', names.remaining_percent, {
        category: CAT.LEVEL_SENSOR,
        type: TYPE.LEVEL_SENSOR.LIQUID_LEVEL_PERCENT,
        unit: UNIT.PERCENT,
        min: 0,
        max: 100,
      }),
      readOnly(ids, 'used_weight', names.used_weight, grams(MAX_USED_GRAMS)),
      readOnly(ids, 'remaining_length', names.remaining_length, {
        category: CAT.DISTANCE_SENSOR,
        type: TYPE.SENSOR.DECIMAL,
        unit: UNIT.M,
        min: 0,
        max: MAX_METRES,
      }),
      readOnly(ids, 'last_used', names.last_used, text),
      readOnly(ids, 'status', names.status, text),
    ],
    params,
  };
}

/**
 * Feature states of a spool. Unknown values (a filament without weight) are
 * left out: Gladys keeps none rather than a false zero.
 * @param {'active' | 'archived' | 'deleted'} [status]
 */
export function buildSpoolStates(gladys, spool, language, status) {
  const ids = spoolIds(gladys, spool.id);
  const states = [];
  const add = (key, value) => {
    if (value !== null && value !== undefined) {
      states.push({ device_feature_external_id: ids.feature(key), state: value });
    }
  };
  const addText = (key, value) => {
    states.push({
      device_feature_external_id: ids.feature(key),
      text: String(value).slice(0, 200),
    });
  };
  const round = (value) => (value === null ? null : Math.round(value));
  add('remaining_weight', round(spool.remainingWeight));
  add('remaining_percent', spool.percent === null ? null : Math.round(spool.percent * 10) / 10);
  add('used_weight', round(spool.usedWeight));
  add('remaining_length', round(spool.remainingLength));
  addText(
    'last_used',
    (spool.lastUsed && formatDate(spool.lastUsed, language)) ||
      (NEVER_USED[language] ?? NEVER_USED.en),
  );
  const labels = STATUS_LABELS[language] ?? STATUS_LABELS.en;
  addText('status', labels[status ?? (spool.archived ? 'archived' : 'active')]);
  return states;
}

/** @param {{ key: string, material: string }} stock */
export function buildStockDevice(gladys, stock, language, url) {
  const names = NAMES[language] ?? NAMES.en;
  const ids = stockIds(gladys, stock.key);
  return {
    name: `${names.stock} ${stock.material}`.slice(0, 60),
    external_id: ids.device,
    model: 'Spoolman',
    should_poll: false,
    features: [
      readOnly(ids, 'remaining_weight', names.stock_weight, grams(MAX_STOCK_GRAMS)),
      readOnly(ids, 'spool_count', names.stock_count, grams(MAX_SPOOLS)),
    ],
    params: [{ name: 'SPOOLMAN_URL', value: url }],
  };
}

export function buildStockStates(gladys, stock) {
  const ids = stockIds(gladys, stock.key);
  return [
    {
      device_feature_external_id: ids.feature('remaining_weight'),
      state: Math.round(stock.weight),
    },
    { device_feature_external_id: ids.feature('spool_count'), state: stock.count },
  ];
}

/**
 * `ext:...:spool:12` -> { type: 'spool', id: '12' }, or null when the id is
 * not one of ours.
 */
export function parseDeviceId(gladys, externalId) {
  if (typeof externalId !== 'string') {
    return null;
  }
  for (const type of [SPOOL_TYPE, STOCK_TYPE]) {
    const prefix = gladys.externalId(`${type}:`);
    if (externalId.startsWith(prefix)) {
      const id = externalId.slice(prefix.length).split(':')[0];
      return id === '' ? null : { type, id };
    }
  }
  return null;
}
