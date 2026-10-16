// -----------------------------------------------------------------------------
// A Spoolman spool, as the API returns it, -> the plain values the integration
// works with. Every weight and length is optional on Spoolman's side: a
// filament without weight has no remaining weight, a spool with neither
// initial weight nor filament weight has no percentage.
//
// Units of the API: weights in grams, lengths in millimetres, dates in UTC
// ISO 8601 without milliseconds (`2026-10-16T08:38:45Z`).
// -----------------------------------------------------------------------------

const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const label = (value) => (typeof value === 'string' ? value.trim() : '');

/** `Prusament` + `Galaxy Black` + `PLA`: the material only when the name lacks it. */
export function spoolName({ id, vendor, filament, material }) {
  const parts = [vendor, filament].filter(Boolean);
  const joined = parts.join(' ');
  if (material && !joined.toLowerCase().includes(material.toLowerCase())) {
    parts.push(material);
  }
  const base = parts.join(' ').slice(0, 70);
  return base === '' ? `Spool #${id}` : `${base} #${id}`;
}

/**
 * @param {object} raw a spool of the API
 * @returns {object | null} null when it has no usable id
 */
export function parseSpool(raw) {
  if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.id) || raw.id < 0) {
    return null;
  }
  const filament = raw.filament && typeof raw.filament === 'object' ? raw.filament : {};
  const vendor = filament.vendor && typeof filament.vendor === 'object' ? filament.vendor : {};
  const remainingWeight = finite(raw.remaining_weight);
  const usedWeight = finite(raw.used_weight);
  // Spoolman's own default for the percentage: the spool's initial weight,
  // else the filament's net weight.
  const initialWeight = finite(raw.initial_weight) ?? finite(filament.weight);
  const percent =
    remainingWeight !== null && initialWeight !== null && initialWeight > 0
      ? Math.max(0, Math.min(100, (remainingWeight / initialWeight) * 100))
      : null;
  const spool = {
    id: raw.id,
    vendor: label(vendor.name),
    filament: label(filament.name),
    material: label(filament.material),
    colorHex: label(filament.color_hex),
    location: label(raw.location),
    remainingWeight,
    usedWeight,
    initialWeight,
    percent,
    // Millimetres in the API, metres here.
    remainingLength: finite(raw.remaining_length) === null ? null : raw.remaining_length / 1000,
    lastUsed: typeof raw.last_used === 'string' && raw.last_used !== '' ? raw.last_used : null,
    archived: raw.archived === true,
  };
  spool.name = spoolName(spool);
  return spool;
}

/** `PLA` -> `pla`, `PETG-CF` -> `petg-cf`, `PLA+` -> `pla-plus`: a stable device id. */
export function materialKey(material) {
  const key = label(material)
    .toLowerCase()
    .replace(/\+/g, '-plus')
    .normalize('NFKD')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return key === '' ? null : key;
}

/** The active (not archived) spools of each material, keyed by materialKey. */
export function stockByMaterial(spools) {
  const stock = new Map();
  for (const spool of spools) {
    const key = materialKey(spool.material);
    if (!key || spool.archived) {
      continue;
    }
    const entry = stock.get(key) ?? { key, material: spool.material, weight: 0, count: 0 };
    entry.count += 1;
    entry.weight += spool.remainingWeight ?? 0;
    stock.set(key, entry);
  }
  return stock;
}
