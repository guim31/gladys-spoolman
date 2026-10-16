// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`): record a consumption on a spool,
// for the printers that do not report it to Spoolman themselves.
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  async use_filament(hub, { fields = {} }) {
    const { spool } = await hub.use(fields.device, fields.amount, fields.unit);
    return {
      remaining_grams: spool.remainingWeight === null ? null : Math.round(spool.remainingWeight),
      remaining_percent: spool.percent === null ? null : Math.round(spool.percent),
    };
  },
};
