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
# mame     = native CPS / Neo-Geo emulator (perf-perfect on Pi 5).
# nodejs   = runtime for @sprixe/bridge (the local launcher daemon).
# git      = needed to clone the bridge sources during provisioning.
apt-get update
apt-get install -y --no-install-recommends \
    chromium \
    cage \
    seatd \
    fonts-noto-color-emoji \
    mame \
    nodejs \
    npm \
    git \
    wayvnc \
    build-essential \
    cmake \
    scdoc

# ── /home/sprixe/start-kiosk.sh — the cage wrapper ──────────────────
# `-d` makes cage exit when the inner command exits, so the
# .bash_profile loop respawns the kiosk on Chromium crashes — the
# auto-restart we'd otherwise need a watchdog for.
cat > /home/sprixe/start-kiosk.sh <<'KIOSK'
#!/bin/sh
# Inner shell launches wayvnc inside cage's Wayland session (so it has
# access to the screen capture protocol the package's stock vnc-user
# service can't reach), then execs Chromium. wayvnc is killed when the
# shell exits — which happens when Chromium quits and cage tears down
# the session, so no zombie listener after a kiosk restart.
exec cage -d -- /bin/sh -c '
    wayvnc 0.0.0.0 5900 &
    exec /usr/bin/chromium \
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
        --password-store=basic \
        https://frontend.sprixe.dev/
'
KIOSK
chown sprixe:sprixe /home/sprixe/start-kiosk.sh
chmod 755 /home/sprixe/start-kiosk.sh

# wayvnc's Debian packaging ships a systemd unit that runs as a
# dedicated 'vnc' user — but that user has no access to the cage
# Wayland socket, so the unit fails on boot and squats port 5900.
# Disable it; we run wayvnc inside cage from start-kiosk.sh instead.
systemctl disable wayvnc.service wayvnc-control.service 2>/dev/null || true

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

# ── @sprixe/bridge — local daemon that lets the kiosk spawn MAME ───
# Cloned shallow into /opt/sprixe so the bridge sources stay readable
# for ad-hoc debug, and so future updates can `git pull` instead of
# re-running this whole script. The npm install pulls workspace deps
# at the root because npm requires a unified node_modules tree —
# disk overhead ~120 MB which is acceptable on a 16 GB+ SD card.
SPRIXE_DIR=/opt/sprixe
# Override SPRIXE_BRANCH to provision against an unmerged feature branch
# (sudo -E bash ~/first-boot.sh with SPRIXE_BRANCH=foo set in your shell).
SPRIXE_BRANCH="${SPRIXE_BRANCH:-main}"
# Until the repo goes public, pass SPRIXE_TOKEN=<github PAT> to clone
# privately. Fine-grained tokens with read-only "Contents" access are
# enough. Falls back to the public URL when no token is set.
if [ -n "${SPRIXE_TOKEN:-}" ]; then
    SPRIXE_REPO="https://x-access-token:${SPRIXE_TOKEN}@github.com/privaloops/sprixe.git"
else
    SPRIXE_REPO=https://github.com/privaloops/sprixe.git
fi
if [ ! -d "$SPRIXE_DIR/.git" ]; then
    git clone --depth 1 --branch "$SPRIXE_BRANCH" "$SPRIXE_REPO" "$SPRIXE_DIR"
fi
chown -R sprixe:sprixe "$SPRIXE_DIR"
sudo -u sprixe npm --prefix "$SPRIXE_DIR" install --no-audit --no-fund
sudo -u sprixe npm -w @sprixe/bridge --prefix "$SPRIXE_DIR" run build

# ROM staging dir owned by sprixe so the bridge can write without sudo.
install -d -m 755 -o sprixe -g sprixe /home/sprixe/sprixe-roms

# Chromium enterprise policy: pre-grant the Local Network Access
# permission so the kiosk page can fetch http://127.0.0.1:7777 (the
# bridge) without the "wants to access other apps and services on
# this device" prompt that ships with Chrome 130+. The kiosk has no
# pointer to dismiss it; without the policy the bridge is silently
# unreachable and launches fall back to the embedded TS engine.
# Both keys cover the legacy and new policy names so the file works
# across the rolling Chromium versions Debian ships.
install -d -m 755 /etc/chromium/policies/managed
cat > /etc/chromium/policies/managed/sprixe-bridge.json <<'POLICY'
{
  "LocalNetworkAccessAllowedForUrls": ["https://frontend.sprixe.dev/*"],
  "InsecurePrivateNetworkRequestsAllowedForUrls": ["https://frontend.sprixe.dev/*"]
}
POLICY
chmod 644 /etc/chromium/policies/managed/sprixe-bridge.json

# ydotool isn't packaged on Debian Trixie / current RPi OS. Compile
# from source — small C++ project, ~30 s on a Pi 5. Skipped if the
# binaries already exist (idempotent re-runs).
if ! command -v ydotool >/dev/null 2>&1; then
    YDOTOOL_SRC=/tmp/ydotool-build
    rm -rf "$YDOTOOL_SRC"
    git clone --depth 1 https://github.com/ReimuNotMoe/ydotool.git "$YDOTOOL_SRC"
    mkdir -p "$YDOTOOL_SRC/build"
    cmake -S "$YDOTOOL_SRC" -B "$YDOTOOL_SRC/build" -DCMAKE_BUILD_TYPE=Release
    cmake --build "$YDOTOOL_SRC/build" --parallel
    cmake --install "$YDOTOOL_SRC/build"
    ldconfig
fi

# ydotoold + uinput access for synthesized keystrokes from the phone
# remote. The bridge calls `ydotool key ...` which requires a running
# ydotoold daemon owning a writable handle on /dev/uinput. We run the
# daemon as the sprixe user so the bridge can talk to its socket
# without root, and add sprixe to the input group + drop a udev rule
# granting that group rw access on /dev/uinput.
groupadd -f input
usermod -aG input sprixe
cat > /etc/udev/rules.d/60-sprixe-uinput.rules <<'UDEV'
KERNEL=="uinput", GROUP="input", MODE="0660", OPTIONS+="static_node=uinput"
UDEV
# /dev/uinput only exists once the kernel module is loaded. Load it
# now and persist via modules-load.d so it comes back after reboot.
modprobe uinput
echo uinput > /etc/modules-load.d/uinput.conf
udevadm control --reload-rules
# `udevadm trigger --name-match=uinput` fails with "Invalid argument"
# on Debian if the trigger runs before the static node settles —
# falling back to `--subsystem-match=misc` which is the bus uinput
# lives on. Tolerate failures so a transient udev hiccup doesn't
# abort the whole provisioner.
udevadm trigger --subsystem-match=misc 2>/dev/null || true

cat > /etc/systemd/system/ydotoold.service <<'UNIT'
[Unit]
Description=ydotool daemon (synthesized input for sprixe-bridge)
After=systemd-user-sessions.service

[Service]
Type=simple
User=sprixe
Group=input
ExecStart=/usr/local/bin/ydotoold --socket-path=/run/sprixe/ydotoold.socket --socket-perm=0660
RuntimeDirectory=sprixe
RuntimeDirectoryMode=0750
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT

# Sudoers rule so the bridge (running as sprixe) can ask systemd to
# reboot or power off without prompting for a password. Scoped to the
# two specific commands — no broader privilege escalation.
cat > /etc/sudoers.d/sprixe-bridge <<'SUDO'
sprixe ALL=(root) NOPASSWD: /usr/bin/systemctl reboot, /usr/bin/systemctl poweroff
SUDO
chmod 440 /etc/sudoers.d/sprixe-bridge

# Systemd unit: starts the bridge after the network is up, restarts
# on crash, runs as the sprixe user (no root surface).
cat > /etc/systemd/system/sprixe-bridge.service <<'UNIT'
[Unit]
Description=Sprixe Bridge — local daemon for native MAME launches
After=network.target
Wants=network.target

[Service]
Type=simple
User=sprixe
Group=sprixe
WorkingDirectory=/opt/sprixe/packages/sprixe-bridge
ExecStart=/usr/bin/node /opt/sprixe/packages/sprixe-bridge/dist/index.js
Environment=SPRIXE_BRIDGE_PORT=7777
Environment=SPRIXE_BRIDGE_ROM_DIR=/home/sprixe/sprixe-roms
Environment=SPRIXE_BRIDGE_MAME_BIN=/usr/games/mame
# MAME spawned by the bridge needs the cage Wayland session to render
# anything; without these two it errors out with
# "XDG_RUNTIME_DIR is invalid or not set". The sprixe user's UID is
# 1000 (set by Pi Imager + autologin), the wayland-0 socket is the
# default cage exposes.
Environment=XDG_RUNTIME_DIR=/run/user/1000
Environment=WAYLAND_DISPLAY=wayland-0
# ydotool reads this to find the ydotoold socket; matches the path
# the ydotoold.service unit creates above.
Environment=YDOTOOL_SOCKET=/run/sprixe/ydotoold.socket
Environment=SPRIXE_BRIDGE_YDOTOOL_BIN=/usr/local/bin/ydotool
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

# ── Enable seatd + bridge + finish ─────────────────────────────────
# Force-enable avahi too: socket activation has been observed to skip
# the daemon at boot when wpa_supplicant is still negotiating Wi-Fi,
# leaving sprixe.local unresolvable. Explicit enable kills the race.
systemctl daemon-reload
systemctl enable --now seatd.service
systemctl enable --now avahi-daemon.service
systemctl enable --now ydotoold.service
systemctl enable --now sprixe-bridge.service

touch "$MARKER"

echo "sprixe-first-boot: provisioning complete — rebooting into the kiosk"
reboot
