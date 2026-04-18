#!/bin/bash
# One-shot pivot from the Xorg+xinit kiosk setup to Wayland+cage.
# Run as root on the Pi after scp'ing this file to ~sprixe/.
#
# Xorg's modesetting driver on RPi 5 + Bookworm has known interop
# bugs with the KMS pipeline (HDMI reported "disconnected" to Xorg
# even when the kernel sees it connected, weird framebuffer sizing,
# Chromium rendering at ~half the panel width). Cage is a 500-line
# Wayland compositor that handles exactly one case: "run this app
# full-screen on the outputs the kernel gives me". It bypasses the
# whole Xorg layer so all those bugs evaporate.

set -euxo pipefail

# ── Packages ────────────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends cage seatd

# ── /home/sprixe/start-kiosk.sh — the cage wrapper ──────────────────
cat > /home/sprixe/start-kiosk.sh <<'KIOSK'
#!/bin/sh
# `-d` tells cage to wait for the inner command and exit when it
# exits, so startup scripts respawn the kiosk cleanly on Chromium
# crashes. --ozone-platform=wayland makes Chromium talk Wayland
# directly instead of falling back to Xwayland.
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
    https://sprixe.app/play/
KIOSK
chown sprixe:sprixe /home/sprixe/start-kiosk.sh
chmod 755 /home/sprixe/start-kiosk.sh

# ── /home/sprixe/.bash_profile — auto-launch on tty1 ────────────────
cat > /home/sprixe/.bash_profile <<'PROFILE'
if [ -z "$WAYLAND_DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
    exec /home/sprixe/start-kiosk.sh
fi
PROFILE
chown sprixe:sprixe /home/sprixe/.bash_profile
chmod 644 /home/sprixe/.bash_profile

# ── Add sprixe to the groups cage needs to grab /dev/dri/* ─────────
# 'seat' only exists on distros that ship an older seatd — Debian
# trixie's seatd 0.9 runs in kernel backend with no group gate, so
# skip any name that isn't present.
for g in seat video render; do
    if getent group "$g" >/dev/null; then
        usermod -aG "$g" sprixe
    fi
done

# ── Make sure seatd is running (cage relies on it) ──────────────────
systemctl enable --now seatd.service

# ── Clean up the old Xorg leftovers so they don't conflict ──────────
rm -f /home/sprixe/.xinitrc
rm -f /etc/X11/Xwrapper.config

echo ""
echo "switch-to-wayland: done — rebooting"
reboot
