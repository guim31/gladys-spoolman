# Spoolman for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for
[Spoolman](https://github.com/Donkie/Spoolman), the self-hosted inventory of
3D printing filament spools. Local only: Gladys talks to your Spoolman server,
no cloud.

## Features

- **One device per spool in use**: remaining weight (g), remaining
  percentage, used weight (g), remaining length (m), last use, status.
- **One stock device per material** (optional): total remaining weight and
  number of spools of PLA, PETG...
- **Live updates** through Spoolman's WebSocket: a print reported by Klipper
  (Moonraker) or OctoPrint moves the values at once.
- **Scene triggers**: _Filament used_ (one event per print, once the
  consumption has settled) and _Spool archived_. Thresholds such as "less
  than 100 g" use Gladys' standard device-state trigger.
- **Scene action**: _Record a filament use_ (grams or metres), for printers
  that do not report to Spoolman.
- **Dashboard widget**: stock tiles, the spools running out first, and a form
  to log a use.
- English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.2.0 or later.
- Spoolman reachable from Gladys (port 7912 by default), directly or behind a
  reverse proxy (sub-path, Basic auth or a token header supported).

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-spoolman` (or find **Spoolman** in the
   catalog).
2. In **Configuration**, enter the address of Spoolman (`192.168.1.50`, port
   7912 by default) and, behind a proxy, its credentials. Save.
3. Add the spools and stocks from the **Discover** tab.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- REST: `GET /api/v1/info`, `GET /api/v1/spool?allow_archived=true` at start,
  at each (re)connection of the live feed, after a filament or vendor change,
  and every 5 minutes as a safety net; `PUT /api/v1/spool/<id>/use` for a
  recorded consumption.
- Live feed: the WebSocket on `/api/v1/` (every resource), reconnected with a
  growing delay.
- The devices are not polled by Gladys (`should_poll: false`): Spoolman pushes,
  only changed states are published, and only for the devices added to
  Gladys.
- Nothing is stored in `/data`.

Tested against a real Spoolman 0.27.0 (`ghcr.io/donkie/spoolman`), in the
sandbox constraints of Gladys (read-only root, no capability, 256 MB); about
17 MB of memory at rest. Not yet tested on a real Gladys instance: feedback
welcome on the Gladys forum.

## Limitations

- One Spoolman server per Gladys.
- Gladys has no gram unit: weights carry "(g)" in their feature names.
- An integration cannot set the room of a device: the Spoolman location is a
  device parameter and a widget filter.
- Spoolman (SQLite) reuses the id of the last spool once deleted: a new spool
  may take over that spool's Gladys device.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and a fake Spoolman answering with
bodies recorded on a real Spoolman 0.27.0 (`test/fixtures/spoolman/`).

## Credits

- [Spoolman](https://github.com/Donkie/Spoolman) by Donkie and contributors
  (MIT), its REST and WebSocket API.
- The Home Assistant integration
  [`spoolman-homeassistant`](https://github.com/Disane87/spoolman-homeassistant)
  by Disane87 and contributors (MIT): the choice of the spool sensors.
- The cover is a generic drawing made for this project.

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the Spoolman
project. "Spoolman" is the name of its owner's project.

## License

Apache-2.0, see [`LICENSE`](LICENSE).
