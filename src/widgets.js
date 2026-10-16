// -----------------------------------------------------------------------------
// The "Filament spools" dashboard widget: the stock at a glance (three tiles),
// the spools that run out first (a list), and a "Log usage" button whose form
// (Gladys 5.2.0) records a consumption, for the printers that do not tell
// Spoolman themselves.
//
// Settings: an optional material and location filter, and the percentage under
// which a spool counts as low.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { spoolIds } from './devices.js';
import { USE_LIMITS, WIDGET_KEY } from './hub.js';
import { formatGrams, formatKilograms } from './texts.js';

export const DEFAULT_LOW_THRESHOLD = 20;
export const MAX_ITEMS = 8;
// A select of the form lists the spools; past that, the filters narrow it.
export const MAX_OPTIONS = 50;
export const USE_ACTION = 'use';

export const TEXT = {
  stock: { en: 'Stock', fr: 'Stock', de: 'Bestand', es: 'Stock' },
  spools: { en: 'Spools', fr: 'Bobines', de: 'Spulen', es: 'Bobinas' },
  low: { en: 'Low', fr: 'Bas', de: 'Knapp', es: 'Bajo' },
  log: { en: 'Log usage', fr: 'Consommation', de: 'Verbrauch', es: 'Consumo' },
  spool: { en: 'Spool', fr: 'Bobine', de: 'Spule', es: 'Bobina' },
  amount: { en: 'Amount', fr: 'Quantité', de: 'Menge', es: 'Cantidad' },
  unit: { en: 'Unit', fr: 'Unité', de: 'Einheit', es: 'Unidad' },
  grams: { en: 'Grams', fr: 'Grammes', de: 'Gramm', es: 'Gramos' },
  meters: { en: 'Metres', fr: 'Mètres', de: 'Meter', es: 'Metros' },
  empty: {
    en: 'No spool in use in Spoolman (or none matches the filters).',
    fr: 'Aucune bobine en service dans Spoolman (ou aucune ne correspond aux filtres).',
    de: 'Keine Spule in Gebrauch in Spoolman (oder keine passt zu den Filtern).',
    es: 'Ninguna bobina en uso en Spoolman (o ninguna coincide con los filtros).',
  },
  waiting: {
    en: 'Waiting for Spoolman: check the address in the configuration.',
    fr: "En attente de Spoolman : vérifiez l'adresse dans la configuration.",
    de: 'Warte auf Spoolman: prüfe die Adresse in der Konfiguration.',
    es: 'Esperando a Spoolman: compruebe la dirección en la configuración.',
  },
  no_values: {
    en: 'Update Gladys to 5.2 to use this form.',
    fr: 'Mettez Gladys à jour en 5.2 pour utiliser ce formulaire.',
    de: 'Aktualisiere Gladys auf 5.2, um dieses Formular zu nutzen.',
    es: 'Actualice Gladys a la versión 5.2 para usar este formulario.',
  },
};

const pick = (table, language) => table[language] ?? table.en;

// The core cuts a select option label at 40 characters.
const OPTION_LABEL_MAX = 40;

/** The name cut to `max`, keeping its ` #12` suffix (two spools of a filament differ by it). */
export function shortName(spool, max) {
  const suffix = ` #${spool.id}`;
  if (spool.name.length <= max) {
    return spool.name;
  }
  const base = spool.name.endsWith(suffix) ? spool.name.slice(0, -suffix.length) : spool.name;
  return `${base.slice(0, max - suffix.length).trimEnd()}${suffix}`;
}
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The settings, normalized. */
export function widgetSettings(settings = {}) {
  const text = (value) => (typeof value === 'string' ? value.trim() : '');
  const threshold = Number(settings.low_threshold);
  return {
    material: text(settings.material),
    location: text(settings.location),
    lowThreshold:
      Number.isFinite(threshold) && threshold > 0 && threshold < 100
        ? threshold
        : DEFAULT_LOW_THRESHOLD,
  };
}

/** The active spools matching the filters, the emptiest first (unknown last). */
export function filteredSpools(hub, settings) {
  return hub
    .activeSpools()
    .filter((s) => !settings.material || same(s.material, settings.material))
    .filter((s) => !settings.location || same(s.location, settings.location))
    .sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101) || a.id - b.id);
}

const isLow = (spool, threshold) => spool.percent !== null && spool.percent < threshold;

function badge(spool, threshold) {
  if (spool.percent === null) {
    return undefined;
  }
  const color =
    spool.percent < threshold / 2
      ? WIDGET_COLORS.DANGER
      : spool.percent < threshold
        ? WIDGET_COLORS.WARNING
        : WIDGET_COLORS.SUCCESS;
  return { text: `${Math.round(spool.percent)} %`, color };
}

function subtitle(spool, language) {
  return [
    spool.remainingWeight === null ? null : formatGrams(spool.remainingWeight, language),
    spool.location || null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function buildContent(hub, { settings: raw, language = 'en' } = {}) {
  if (!hub.loaded) {
    return {
      ttl_seconds: 60,
      components: [{ type: 'text', variant: 'body', text: pick(TEXT.waiting, language) }],
    };
  }
  const settings = widgetSettings(raw);
  const spools = filteredSpools(hub, settings);
  if (spools.length === 0) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', variant: 'body', text: pick(TEXT.empty, language) }],
    };
  }
  const total = spools.reduce((sum, s) => sum + (s.remainingWeight ?? 0), 0);
  const low = spools.filter((s) => isLow(s, settings.lowThreshold)).length;
  const fields = [
    {
      key: 'spool',
      type: 'select',
      required: true,
      label: TEXT.spool,
      default: String(spools[0].id),
      options: spools.slice(0, MAX_OPTIONS).map((s) => {
        // A brand and a colour name: the same in every language.
        const label = shortName(s, OPTION_LABEL_MAX);
        return { value: String(s.id), label: { en: label, fr: label, de: label, es: label } };
      }),
    },
    {
      key: 'amount',
      type: 'number',
      required: true,
      min: 1,
      max: USE_LIMITS.grams,
      default: 10,
      label: TEXT.amount,
    },
    {
      key: 'unit',
      type: 'select',
      required: true,
      label: TEXT.unit,
      default: 'grams',
      options: [
        { value: 'grams', label: TEXT.grams },
        { value: 'meters', label: TEXT.meters },
      ],
    },
  ];
  return {
    // Spoolman pushes its changes and the hub nudges the widget.
    ttl_seconds: 600,
    components: [
      {
        type: 'value',
        label: pick(TEXT.stock, language),
        value: formatKilograms(total, language),
        unit: 'kg',
        icon: 'package',
      },
      { type: 'value', label: pick(TEXT.spools, language), value: spools.length, icon: 'disc' },
      {
        type: 'value',
        label: pick(TEXT.low, language),
        value: low,
        icon: 'alert-triangle',
        color: low > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
      },
      {
        type: 'card-list',
        display: 'list',
        items: spools.slice(0, MAX_ITEMS).map((spool) => {
          const item = { title: shortName(spool, 60) };
          const sub = subtitle(spool, language);
          if (sub) {
            item.subtitle = sub;
          }
          const mark = badge(spool, settings.lowThreshold);
          if (mark) {
            item.badge = mark;
          }
          return item;
        }),
      },
      {
        type: 'button',
        label: pick(TEXT.log, language),
        icon: 'edit-3',
        style: 'secondary',
        action: { key: USE_ACTION, fields },
      },
    ],
  };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get: (hub, request) => buildContent(hub, request),
    async action(hub, { actionKey, values }) {
      if (actionKey !== USE_ACTION) {
        throw new Error(`Unknown widget action ${actionKey}`);
      }
      if (!values || typeof values !== 'object') {
        // A Gladys older than 5.2.0 runs the button without its form.
        throw new Error(pick(TEXT.no_values, hub.language));
      }
      const device = spoolIds(hub.gladys, values.spool).device;
      const { message } = await hub.use(device, values.amount, values.unit);
      return message;
    },
  },
};
