# @sprixe/image — RPi kiosk provisioner

Thin-client Raspberry Pi OS setup. The box boots straight into Chromium
kiosk mode pointed at `https://sprixe.app/play/`. No local server, no
Node.js, no ROMs bundled.

## How to flash an SD card

1. Install **Raspberry Pi Imager** (free, from raspberrypi.com or Homebrew).
2. Choose **Raspberry Pi OS Lite (64-bit)** for **Raspberry Pi 5**.
3. Pick your target SD card.
4. Click the gear icon (advanced settings):
   - Hostname: `sprixe`
   - Username: `sprixe` + pick a password
   - Wireless LAN: SSID + password (the first-boot script needs internet for `apt install`)
   - Locale: whatever suits
   - In **"Run custom script on first boot"**, paste the entire contents of [`first-boot.sh`](./first-boot.sh).
5. Click **Write**. ~3 minutes later the SD card is ready.
6. Put the SD card in the Pi, plug in HDMI + power.

On the **first boot** the script installs Chromium + systemd units + the
watchdog (~5–10 minutes, silent), then reboots. From the **second
boot** onward the Pi lands on the arcade in seconds.

## Updating a deployed Pi

Edit the systemd unit or watchdog script on the Pi over SSH and
`systemctl daemon-reload && systemctl restart sprixe-kiosk.service`.
For a clean re-provision, delete `/var/lib/sprixe-installed` and run
`first-boot.sh` again.

## What the script installs

- `sprixe-kiosk.service` — xinit + Chromium kiosk pointed at the arcade
- `sprixe-watchdog.service` + `.timer` — resets + restarts the kiosk if systemd marks it failed
- `/usr/local/bin/sprixe-watchdog.sh` — the health check the timer runs
- Autologin drop-in for `sprixe` on tty1
- Disables: bluetooth, hciuart, avahi, apt-daily, ModemManager (shrinks boot time)

## Why not pi-gen?

An earlier iteration tried to build a custom RPi OS image with pi-gen
so we could hand you a single `.img.xz` to flash. On Apple Silicon +
Docker Desktop that pipeline stacks three fragile layers (armhf/arm64
emulation, debootstrap chroot, an outdated `debian-archive-keyring` in
the base Debian container) and each one needs a workaround before the
next one can run. The Raspberry Pi Imager workflow lets us keep the
upstream image intact and apply our overlay at first boot — five
steps in a GUI instead of 45 minutes of Docker sudo and silent
failures.

We still validate every config file in CI through the `kiosk` Playwright
project (same Chromium flags as the service), so breaking the kiosk
flags fails a PR before any SD card is flashed.

## Smoke-testing `first-boot.sh` locally

Before flashing, you can validate the script end-to-end in an arm64
Docker container:

```bash
cd packages/sprixe-image
./test-first-boot.sh
```

It mocks `apt-get` / `systemctl` / `reboot`, runs `first-boot.sh`, then
asserts every expected file exists, the watchdog is executable, the
autologin drop-in points at `sprixe`, the kiosk unit targets
`sprixe.app/play/` with the `SharedArrayBuffer` flag, and
`systemd-analyze verify` accepts all three units. Finishes in ~30 s on
a warm Docker cache. Needs Docker Desktop running; on Intel Macs /
Linux x86_64 it registers arm64 binfmt handlers automatically on the
first run.
