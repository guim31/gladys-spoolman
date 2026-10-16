# Spoolman

Follow your 3D printing filament spools in Gladys through
[Spoolman](https://github.com/Donkie/Spoolman), the self-hosted filament
inventory: remaining weight and length of each spool, the stock of each
material, what a print used, and a consumption you record yourself.
Everything stays on your local network: Gladys talks directly to Spoolman.

Spoolman updates Gladys **live**: as soon as Klipper (Moonraker), OctoPrint or
the Spoolman web page changes a spool, its values move in Gladys.

Tested against a real Spoolman 0.27.0 (its official Docker image). Feedback
welcome on the Gladys forum.

## Prerequisites

- Gladys Assistant 5.2 or later (the widget form needs it).
- A Spoolman server reachable from the Gladys machine, on port 7912 by
  default, or through a reverse proxy.
- To follow prints automatically: a printer that reports its consumption to
  Spoolman, such as Klipper with the `[spoolman]` section of Moonraker, or
  OctoPrint with its Spoolman plugin. Otherwise, record the consumption with
  the scene action or the widget.

## Configuration

1. Open the **Configuration** tab of the integration.
2. In **Spoolman address**, enter the IP address of the server, for example
   `192.168.1.50`: the integration then uses port 7912. Add a port if yours
   differs (`192.168.1.50:8000`). Behind a reverse proxy, enter the full
   address, sub-path included (`https://example.org/spoolman`).
3. Spoolman has no login of its own. If your proxy asks for credentials, fill
   in **Proxy user name** and **Proxy password** (HTTP Basic), or an **Extra
   HTTP header** written `Name: value` (a token).
4. **One stock device per material** (on by default) adds a device per
   material (PLA, PETG...) with its total remaining weight.
5. **Language of names and messages** sets the feature names (fixed when the
   device is added) and the texts. French by default.
6. Save, then use **Test the connection**: it shows the Spoolman version, the
   number of spools in use and the state of the live updates.
7. In the **Discovery** tab, add the spools and stocks you want to follow.

## Devices

**A spool** (one per spool in use, named after its vendor, filament and
material, with its Spoolman number: `Prusament Galaxy Black PLA #1`):

| Feature              | Value                                             |
| -------------------- | ------------------------------------------------- |
| Remaining weight (g) | grams of filament left                            |
| Remaining            | percentage left, of the initial weight            |
| Used weight (g)      | grams used since the spool was registered         |
| Remaining length     | metres of filament left                           |
| Last used            | date and time of the last consumption, or "Never" |
| Status               | "In use", "Archived" or "Deleted in Spoolman"     |

The location, colour and number of the spool are in the device parameters.
A spool whose filament has no weight in Spoolman publishes no remaining weight
nor percentage: fill in the filament weight in Spoolman.

**A stock** (`Stock PLA`): the total remaining weight (g) and the number of
spools in use of a material.

An archived spool leaves the Discovery tab; once added to Gladys, its device
stays and shows "Archived". Delete it in Gladys when you no longer need its
history.

## Dashboard widget

**Filament spools**: three tiles (total stock in kg, number of spools, number
of low spools), the list of the spools that run out first with their
remaining weight, location and percentage (green, orange under the threshold,
red under half of it), and a **Log usage** button: it opens a form (spool,
amount, grams or metres) and records the consumption in Spoolman.

Settings: a material (`PLA`) and a Spoolman location to filter the list, and
the percentage under which a spool counts as low (20 % by default).

## Scene triggers

- **Filament used**: a spool lost weight in Spoolman (a print reported by the
  printer), once the consumption has stopped for 2 minutes, so a whole print
  gives one event. Optional filter: the spool. Variables: spool name,
  material, location, grams used, grams left, percentage left. A consumption
  recorded by the integration itself (scene action, widget) does not fire it.
- **Spool archived**: a spool was archived in Spoolman (usually: it is empty).
  Optional filter: the spool. Variables: spool name, material, location.

A threshold ("less than 100 g") needs no special trigger: use the standard
**Device state change** trigger on the remaining weight or percentage of a spool, or
on the remaining weight of a stock.

## Scene actions

**Record a filament use**: subtracts an amount (in grams or metres) from a
spool in Spoolman, for a printer that does not report it (for instance at the
end of a print announced by another integration). Outputs: grams left,
percentage left.

## Scene examples

- **Order filament before it runs out**: trigger "Device state change", the
  remaining weight of `Stock PETG` below 500 → send a message "Less than
  500 g of PETG left".
- **Spool almost empty**: trigger "Device state change", the remaining weight of a
  spool below 100 → message "Spool almost empty: order a new one".
- **Print report**: trigger **Filament used** → a message built with its
  variables: grams used, spool name, grams left.
- **A printer without Spoolman support**: trigger "print finished" of its
  integration → action **Record a filament use** on the loaded spool.

## Troubleshooting

- **"Spoolman does not answer"**: check the address and the port (7912 with
  the official Docker image, 8000 inside the container), and that the Gladys
  machine reaches it.
- **"Access refused (401)" or "(403)"**: your proxy refuses the credentials or
  the header. Spoolman itself answers 403 only to a request coming from
  another website (a browser): the integration sends none.
- **"Does not answer like Spoolman"**: the address leads to a login page or
  another service. With a sub-path, enter it in full.
- **A spool has no remaining weight**: its filament has no weight in
  Spoolman.
- More details in the logs of the integration (`LOG_LEVEL=debug` for every
  update).

## Limits

- One Spoolman server.
- Gladys has no gram unit: the weights carry "(g)" in their names.
- The room of a device cannot be set by an integration: assign it in Gladys.
  The Spoolman location is in the device parameters and filters the widget.
- Spoolman reuses the number of the last spool when it is deleted (SQLite):
  a new spool may then take over its Gladys device.
- The live updates need the WebSocket to go through your proxy; otherwise the
  integration reads Spoolman every 5 minutes.
- A filament or vendor change reloads the whole list (Spoolman sends no spool
  update for it).
