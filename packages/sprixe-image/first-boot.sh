#!/bin/bash
# Sprixe Arcade — first-boot provisioner for Raspberry Pi OS Lite 64-bit.
#
# Installs Chromium + cage (a 500-line Wayland kiosk compositor) and
# wires the classic auto-startup chain:
#   autologin 'sprixe' on tty1 → .bash_profile exec start-kiosk.sh →
#   cage launches Chromium full-screen, talking Wayland directly.
#
# Why Wayland and not Xorg: the Xorg modesetting driver on RPi 5 +
# Bookworm has known interop bugs with the KMS pipeline (HDMI seen
# as "disconnected" by Xorg even when the kernel sees it connected,
# Chromium rendering at ~half the panel width). Cage bypasses Xorg
# entirely and lets Chromium use the kernel's own modesetting, so
# the panel auto-detects at the resolution the user actually has
# without any of that ceremony.
#
# Re-running after success is safe — a marker short-circuits.

set -euxo pipefail

MARKER=/var/lib/sprixe-installed
if [ -f "$MARKER" ]; then
    echo "sprixe-first-boot: already installed — nothing to do"
    exit 0
fi

export DEBIAN_FRONTEND=noninteractive

# ── Packages ────────────────────────────────────────────────────────
# chromium = RPi OS flavour, ships with VideoCore GPU acceleration.
# cage     = minimal Wayland compositor: one window, full-screen.
# seatd    = grants cage access to /dev/dri/card0 without root.
apt-get update
apt-get install -y --no-install-recommends \
    chromium \
    cage \
    seatd \
    fonts-noto-color-emoji

# ── /home/sprixe/start-kiosk.sh — the cage wrapper ──────────────────
# `-d` makes cage exit when the inner command exits, so the
# .bash_profile loop respawns the kiosk on Chromium crashes — the
# auto-restart we'd otherwise need a watchdog for.
cat > /home/sprixe/start-kiosk.sh <<'KIOSK'
#!/bin/sh
exec cage -d -- /usr/bin/chromium \
    --ozone-platform=wayland \
    --kiosk \
    --no-first-run --disable-infobars \
    --noerrdialogs --disable-translate \
    --disable-session-crashed-bubble \
    --disable-component-update \
    --autoplay-policy=no-user-gesture-required \
    --enable-features=SharedArrayBuffer \
    --enable-gpu-rasterization --enable-zero-copy \
    --ignore-gpu-blocklist \
    --user-data-dir=/home/sprixe/.chromium \
    https://beta.sprixe.dev/
KIOSK
chown sprixe:sprixe /home/sprixe/start-kiosk.sh
chmod 755 /home/sprixe/start-kiosk.sh

# ── /home/sprixe/.bash_profile — auto-launch on tty1 ────────────────
# Triggered by the autologin drop-in below. exec replaces the shell
# with start-kiosk.sh, so when Chromium / cage exits the login loop
# reclaims tty1 and re-runs this file — auto-restart, no watchdog.
cat > /home/sprixe/.bash_profile <<'PROFILE'
if [ -z "$WAYLAND_DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
    exec /home/sprixe/start-kiosk.sh
fi
PROFILE
chown sprixe:sprixe /home/sprixe/.bash_profile
chmod 644 /home/sprixe/.bash_profile

# ── Autologin 'sprixe' on tty1 ──────────────────────────────────────
install -d -m 755 /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf <<'CONF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin sprixe --noclear %I $TERM
CONF

# ── Add 'sprixe' to the groups cage needs to grab /dev/dri/* ───────
# 'seat' only exists on distros with older seatd builds — Debian
# trixie's seatd 0.9 runs in kernel backend with no group gate, so
# skip any name that isn't present.
for g in seat video render; do
    if getent group "$g" >/dev/null; then
        usermod -aG "$g" sprixe
    fi
done

# ── Trim services irrelevant to a kiosk appliance ───────────────────
# Note: avahi-daemon stays enabled — it publishes the 'sprixe.local'
# mDNS hostname the maintainer relies on for SSH.
for svc in \
    bluetooth.service hciuart.service \
    ModemManager.service \
    apt-daily.service apt-daily.timer apt-daily-upgrade.timer
do
    systemctl disable --now "$svc" 2>/dev/null || true
done

# ── Enable seatd + finish ──────────────────────────────────────────
systemctl daemon-reload
systemctl enable --now seatd.service

touch "$MARKER"

echo "sprixe-first-boot: provisioning complete — rebooting into the kiosk"
reboot
