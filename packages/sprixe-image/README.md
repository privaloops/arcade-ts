# @sprixe/image — RPi SD Card Image

Thin-client Raspberry Pi OS image. Boots into Chromium kiosk pointed at
`https://sprixe.app/play/`. No local server, no Node.js, no ROMs bundled.

## Build

Images are built via [pi-gen](https://github.com/RPi-Distro/pi-gen) using the
custom `stage-sprixe/` stage in this directory.

Local build (requires Docker + sudo):

```bash
make image    # produces sprixe-arcade.img.xz via pi-gen
make clean
```

CI builds happen automatically on GitHub Release — see
`.github/workflows/build-image.yml` (Phase 5).

## Structure

- `stage-sprixe/00-install-deps/` — apt: chromium + X11 + plymouth
- `stage-sprixe/01-kiosk-config/` — systemd units, boot config, autologin
- `stage-sprixe/02-plymouth/` — Sprixe boot splash theme (`logo.png` is added in Phase 5)
- `stage-sprixe/03-optimize/` — disable bluetooth/avahi/apt-daily
- `config` — pi-gen top-level config
- `Makefile` — local wrapper around pi-gen

Phase 5 validates the full image on real RPi 5 hardware.
