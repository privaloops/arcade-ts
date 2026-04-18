#!/bin/bash
# Sprixe Arcade — first-boot provisioner for Raspberry Pi OS Lite 64-bit.
#
# Installs Chromium + Xorg, then wires the classic RPi-kiosk pattern:
# autologin 'sprixe' on tty1 → .bash_profile exec startx → .xinitrc
# launches Chromium in kiosk mode. When Chromium crashes, startx
# exits, the shell loops back through .bash_profile, and the arcade
# is back on screen in seconds — no systemd kiosk service, no
# background/foreground tangling.
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
# xserver-xorg + xinit: stable, boring, exactly what kiosk tutorials
# converge on. unclutter hides the mouse cursor after 0.1s idle.
apt-get update
apt-get install -y --no-install-recommends \
    chromium \
    xserver-xorg \
    xinit \
    unclutter \
    fonts-noto-color-emoji

# ── /home/sprixe/.xinitrc — actual kiosk entry point ───────────────
cat > /home/sprixe/.xinitrc <<'XINIT'
#!/bin/sh
# Kill screen blanking + DPMS so the arcade stays lit.
xset -dpms
xset s off
xset s noblank
# Hide the cursor once it's idle.
unclutter -idle 0.1 -root &
# Launch the arcade. exec hands control over so Chromium becomes the
# X session root — when it exits, X exits, and the calling startx /
# .bash_profile loop restarts us.
exec /usr/bin/chromium \
    --kiosk --no-first-run --disable-infobars \
    --noerrdialogs --disable-translate \
    --disable-session-crashed-bubble \
    --disable-component-update \
    --autoplay-policy=no-user-gesture-required \
    --enable-features=SharedArrayBuffer \
    --enable-gpu-rasterization --enable-zero-copy \
    --ignore-gpu-blocklist \
    --user-data-dir=/home/sprixe/.chromium \
    https://sprixe.app/play/
XINIT
chown sprixe:sprixe /home/sprixe/.xinitrc
chmod 755 /home/sprixe/.xinitrc

# ── /home/sprixe/.bash_profile — auto-startx on tty1 ────────────────
cat > /home/sprixe/.bash_profile <<'PROFILE'
# Triggered by the autologin drop-in on tty1. Runs startx once the
# shell lands; `exec` means the shell is replaced by startx, so when
# Chromium / xinit exits the login loop reclaims tty1 and re-runs
# this file — the kiosk respawns automatically, no watchdog needed.
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
    exec startx -- :0 -nocursor
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

# ── Allow 'sprixe' to run X as a regular user ───────────────────────
# Debian locks /usr/lib/xorg/Xorg down to 'console' sessions — without
# this override, startx aborts with "only console users are allowed
# to run the X server". The allowed_users line below is the Debian-
# blessed way to relax it for a dedicated kiosk user.
install -d -m 755 /etc/X11
cat > /etc/X11/Xwrapper.config <<'WRAPPER'
allowed_users=anybody
needs_root_rights=yes
WRAPPER

# ── Trim services irrelevant to a kiosk appliance ───────────────────
# Note: avahi-daemon is intentionally kept enabled — it publishes the
# 'sprixe.local' mDNS hostname that the maintainer uses for SSH.
for svc in \
    bluetooth.service hciuart.service \
    ModemManager.service \
    apt-daily.service apt-daily.timer apt-daily-upgrade.timer
do
    systemctl disable --now "$svc" 2>/dev/null || true
done

# ── Finish ──────────────────────────────────────────────────────────
systemctl daemon-reload
touch "$MARKER"

echo "sprixe-first-boot: provisioning complete — rebooting into the kiosk"
reboot
