# @sprixe/bridge

Local HTTP bridge that lets the Sprixe Frontend (running in a Chromium
kiosk) launch native MAME without leaving the browser sandbox. Lives
on the Raspberry Pi alongside the kiosk; web users without a Pi never
see it.

## Why

The browser sandbox can't `exec` a binary, but native MAME on a Pi 5
runs CPS-1 / Neo-Geo at perfect framerate where the in-browser TS
interpreter does not. The bridge sits on `127.0.0.1:7777` and exposes
a tiny HTTP+SSE surface so the frontend can ship a ROM and tell MAME
to take over the screen.

When the bridge is unreachable (web build, no Pi, dev on Mac), the
frontend falls back to its embedded TS engine — same code path, same
URL, no separate build.

## Endpoints

| Method | Path     | What it does                                                                 |
|--------|----------|------------------------------------------------------------------------------|
| GET    | /health  | `{ ok, running, gameId }`. Used by the frontend to detect the bridge.        |
| POST   | /launch  | Body = ROM ZIP bytes (octet-stream). Header `X-Game-Id: <set>`. 202 on spawn. |
| POST   | /quit    | SIGTERM the running MAME. 200.                                              |
| GET    | /events  | SSE stream of `{ type: launched/exited/error, gameId, ... }`.                |

## Run locally

```bash
npm -w @sprixe/bridge run dev
```

By default listens on port 7777, writes ROMs to `/tmp/sprixe-roms/`.
Override via `SPRIXE_BRIDGE_PORT` and `SPRIXE_BRIDGE_ROM_DIR`.

For dev on a machine without MAME installed, the spawn will fail and
the bridge will emit `{ type: "error", message: "ENOENT" }` on
`/events` — useful to wire up the frontend before the Pi is in the
loop.

## Tests

```bash
npm -w @sprixe/bridge test
```

Tests pass a fake spawner so nothing real is invoked. CI never needs
MAME installed.

## Deployment

Installed by `packages/sprixe-image/first-boot.sh` as a systemd
service (`sprixe-bridge.service`), auto-start at boot, restart on
crash. The service file lives next to the kiosk autologin.
