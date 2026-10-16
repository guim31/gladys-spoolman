// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface. German says "du", Spanish "usted" (test/i18n.test.js).
// -----------------------------------------------------------------------------

// Feature names (frozen by Gladys at creation). Gladys has no gram unit: the
// unit goes into the name.
export const NAMES = {
  en: {
    remaining_weight: 'Remaining weight (g)',
    remaining_percent: 'Remaining',
    used_weight: 'Used weight (g)',
    remaining_length: 'Remaining length',
    last_used: 'Last used',
    status: 'Status',
    stock_weight: 'Remaining weight (g)',
    stock_count: 'Spools',
    stock: 'Stock',
  },
  fr: {
    remaining_weight: 'Poids restant (g)',
    remaining_percent: 'Restant',
    used_weight: 'Poids utilisé (g)',
    remaining_length: 'Longueur restante',
    last_used: 'Dernière utilisation',
    status: 'État',
    stock_weight: 'Poids restant (g)',
    stock_count: 'Bobines',
    stock: 'Stock',
  },
  de: {
    remaining_weight: 'Restgewicht (g)',
    remaining_percent: 'Verbleibend',
    used_weight: 'Verbrauchtes Gewicht (g)',
    remaining_length: 'Restlänge',
    last_used: 'Zuletzt verwendet',
    status: 'Status',
    stock_weight: 'Restgewicht (g)',
    stock_count: 'Spulen',
    stock: 'Bestand',
  },
  es: {
    remaining_weight: 'Peso restante (g)',
    remaining_percent: 'Restante',
    used_weight: 'Peso usado (g)',
    remaining_length: 'Longitud restante',
    last_used: 'Último uso',
    status: 'Estado',
    stock_weight: 'Peso restante (g)',
    stock_count: 'Bobinas',
    stock: 'Stock',
  },
};

export const STATUS_LABELS = {
  en: { active: 'In use', archived: 'Archived', deleted: 'Deleted in Spoolman' },
  fr: { active: 'En service', archived: 'Archivée', deleted: 'Supprimée de Spoolman' },
  de: { active: 'In Gebrauch', archived: 'Archiviert', deleted: 'In Spoolman gelöscht' },
  es: { active: 'En uso', archived: 'Archivada', deleted: 'Eliminada en Spoolman' },
};

export const NEVER_USED = {
  en: 'Never',
  fr: 'Jamais',
  de: 'Nie',
  es: 'Nunca',
};

export const INIT_FAILED = {
  en: 'The integration could not start: see its logs.',
  fr: "L'intégration n'a pas pu démarrer : consultez ses journaux.",
  de: 'Die Integration konnte nicht starten: sieh dir ihre Protokolle an.',
  es: 'La integración no pudo iniciarse: consulte sus registros.',
};

// The connection status shown in the Configuration screen.
export const STATUS_TEXT = {
  en: {
    none: 'Enter the address of Spoolman.',
    invalid: 'The Spoolman address is not valid (http or https, without user name in it).',
    header: 'The extra header is ignored: write it as "Name: value".',
    unreachable: 'Spoolman does not answer: check its address and that it is running.',
    unauthorized: 'Access refused (401): check the user name and password of the proxy.',
    forbidden: 'Access refused (403): check the proxy credentials or extra header.',
    invalid_answer: 'This address does not answer like Spoolman (a proxy login page?).',
  },
  fr: {
    none: "Saisissez l'adresse de Spoolman.",
    invalid:
      "L'adresse de Spoolman n'est pas valide (http ou https, sans nom d'utilisateur dedans).",
    header: "L'en-tête supplémentaire est ignoré : écrivez-le « Nom: valeur ».",
    unreachable: 'Spoolman ne répond pas : vérifiez son adresse et qu’il est démarré.',
    unauthorized: "Accès refusé (401) : vérifiez l'utilisateur et le mot de passe du proxy.",
    forbidden: "Accès refusé (403) : vérifiez les identifiants du proxy ou l'en-tête.",
    invalid_answer: 'Cette adresse ne répond pas comme Spoolman (page de connexion d’un proxy ?).',
  },
  de: {
    none: 'Gib die Adresse von Spoolman ein.',
    invalid: 'Die Spoolman-Adresse ist ungültig (http oder https, ohne Benutzername darin).',
    header: 'Der zusätzliche Header wird ignoriert: schreib ihn als „Name: Wert“.',
    unreachable: 'Spoolman antwortet nicht: prüfe die Adresse und ob es läuft.',
    unauthorized: 'Zugriff verweigert (401): prüfe Benutzername und Passwort des Proxys.',
    forbidden: 'Zugriff verweigert (403): prüfe die Proxy-Zugangsdaten oder den Header.',
    invalid_answer: 'Diese Adresse antwortet nicht wie Spoolman (Anmeldeseite eines Proxys?).',
  },
  es: {
    none: 'Introduzca la dirección de Spoolman.',
    invalid: 'La dirección de Spoolman no es válida (http o https, sin nombre de usuario).',
    header: 'Se ignora la cabecera adicional: escríbala como «Nombre: valor».',
    unreachable: 'Spoolman no responde: compruebe su dirección y que esté en marcha.',
    unauthorized: 'Acceso denegado (401): compruebe el usuario y la contraseña del proxy.',
    forbidden: 'Acceso denegado (403): compruebe las credenciales del proxy o la cabecera.',
    invalid_answer: 'Esta dirección no responde como Spoolman (¿página de acceso de un proxy?).',
  },
};

// The "Test the connection" action, one line each.
export const TEST_TEXT = {
  en: {
    ok: (version, count) => `Spoolman ${version} answers: ${count} spool(s) in use.`,
    live: 'Live updates: connected.',
    noLive: 'Live updates: not connected yet, refreshed every 5 minutes meanwhile.',
  },
  fr: {
    ok: (version, count) => `Spoolman ${version} répond : ${count} bobine(s) en service.`,
    live: 'Mises à jour en direct : connectées.',
    noLive: 'Mises à jour en direct : pas encore connectées, relecture toutes les 5 minutes.',
  },
  de: {
    ok: (version, count) => `Spoolman ${version} antwortet: ${count} Spule(n) in Gebrauch.`,
    live: 'Live-Aktualisierung: verbunden.',
    noLive: 'Live-Aktualisierung: noch nicht verbunden, bis dahin alle 5 Minuten.',
  },
  es: {
    ok: (version, count) => `Spoolman ${version} responde: ${count} bobina(s) en uso.`,
    live: 'Actualizaciones en directo: conectadas.',
    noLive: 'Actualizaciones en directo: aún no conectadas, lectura cada 5 minutos mientras tanto.',
  },
};

// Errors of the scene action and the widget form.
export const COMMAND_ERRORS = {
  en: {
    unknown_spool: 'Unknown spool: pick a spool of this integration.',
    archived: 'This spool is archived in Spoolman.',
    amount: (max) => `Enter an amount between 1 and ${max}.`,
    unit: 'Choose grams or metres.',
    unreachable: 'Spoolman does not answer: nothing was recorded.',
    refused: 'Spoolman refused the consumption.',
  },
  fr: {
    unknown_spool: 'Bobine inconnue : choisissez une bobine de cette intégration.',
    archived: 'Cette bobine est archivée dans Spoolman.',
    amount: (max) => `Saisissez une quantité entre 1 et ${max}.`,
    unit: 'Choisissez grammes ou mètres.',
    unreachable: "Spoolman ne répond pas : rien n'a été enregistré.",
    refused: 'Spoolman a refusé la consommation.',
  },
  de: {
    unknown_spool: 'Unbekannte Spule: wähle eine Spule dieser Integration.',
    archived: 'Diese Spule ist in Spoolman archiviert.',
    amount: (max) => `Gib eine Menge zwischen 1 und ${max} ein.`,
    unit: 'Wähle Gramm oder Meter.',
    unreachable: 'Spoolman antwortet nicht: nichts wurde erfasst.',
    refused: 'Spoolman hat den Verbrauch abgelehnt.',
  },
  es: {
    unknown_spool: 'Bobina desconocida: elija una bobina de esta integración.',
    archived: 'Esta bobina está archivada en Spoolman.',
    amount: (max) => `Introduzca una cantidad entre 1 y ${max}.`,
    unit: 'Elija gramos o metros.',
    unreachable: 'Spoolman no responde: no se ha registrado nada.',
    refused: 'Spoolman rechazó el consumo.',
  },
};

/** A multi-language message of COMMAND_ERRORS. */
export function commandMessage(code, ...args) {
  return Object.fromEntries(
    Object.entries(COMMAND_ERRORS).map(([language, table]) => {
      const entry = table[code] ?? table.refused;
      return [language, typeof entry === 'function' ? entry(...args) : entry];
    }),
  );
}

/** The toast after a recorded consumption. */
export const USED_TEXT = {
  en: (amount, name, left) => `${amount} recorded on ${name}${left ? `, ${left} left` : ''}.`,
  fr: (amount, name, left) => `${amount} enregistrés sur ${name}${left ? `, reste ${left}` : ''}.`,
  de: (amount, name, left) => `${amount} auf ${name} erfasst${left ? `, ${left} übrig` : ''}.`,
  es: (amount, name, left) => `${amount} registrados en ${name}${left ? `, quedan ${left}` : ''}.`,
};

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/**
 * `2026-10-16T08:38:45Z` -> `16/10/2026 10:38` in the time zone of Gladys
 * (the supervisor injects TZ).
 */
export function formatDate(iso, language) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

/** 1234.5 -> `1 235 g` / `1,235 g`, in the user's language. */
export function formatGrams(grams, language) {
  return `${new Intl.NumberFormat(LOCALES[language] ?? LOCALES.en, {
    maximumFractionDigits: 0,
  }).format(grams)} g`;
}

/** 1500 -> `1.5 kg` (widget tiles hold 12 characters). */
export function formatKilograms(grams, language) {
  return new Intl.NumberFormat(LOCALES[language] ?? LOCALES.en, {
    maximumFractionDigits: grams >= 10_000 ? 0 : 1,
  }).format(grams / 1000);
}

/** The amount of a consumption, `25 g` or `3 m`. */
export function formatAmount(amount, unit, language) {
  if (unit === 'grams') {
    return formatGrams(amount, language);
  }
  return `${new Intl.NumberFormat(LOCALES[language] ?? LOCALES.en).format(amount)} m`;
}
