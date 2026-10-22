# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-22

### Security

- Rebuilt on Node.js 24.22.1, the October 2026 security release (remote code
  execution in the Brotli decoder, CVE-2026-111497; TLS hostname and DNS
  fixes).

## [1.0.0] - 2026-10-16

### Added

- First version: Spoolman filament spools in Gladys, updated live through
  Spoolman's WebSocket.
- One device per spool in use: remaining weight, remaining percentage, used
  weight, remaining length, last use and status.
- One stock device per material (optional): total remaining weight and number
  of spools.
- Scene triggers "Filament used" (one event per print) and "Spool archived".
- Scene action "Record a filament use", in grams or metres.
- Dashboard widget "Filament spools": stock, the spools running out first, and
  a form to log a use (Gladys 5.2.0).
- Reverse proxy support: sub-path, Basic auth, a token header.
- English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-spoolman/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-spoolman/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/guim31/gladys-spoolman/releases/tag/v1.0.0
