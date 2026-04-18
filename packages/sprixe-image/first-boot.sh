#!/bin/bash
# Sprixe Arcade — first-boot provisioner for Raspberry Pi OS Lite 64-bit.
#
# Paste this whole file into the Raspberry Pi Imager's
# "Run custom script on first boot" field. On the very first boot
# after flashing, the script installs Chromium + supporting packages,
# drops every systemd unit into place, enables autologin for the
# 'sprixe' user, and reboots. From the second boot on the RPi lands
# straight in the arcade.
#
# Prerequisites (all set in the Imager's advanced panel BEFORE flashing):
#   - WiFi SSID + password (first-boot does apt install, needs net)
#   - Username: sprixe
#   - Hostname: sprixe (optional but tidy)
#
# Re-running the script after success is safe — the marker file at
# /var/lib/sprixe-installed short-circuits every subsequent run.

set -euxo pipefail

MARKER=/var/lib/sprixe-installed
if [ -f "$MARKER" ]; then
    echo "sprixe-first-boot: already installed — nothing to do"
    exit 0
fi

export DEBIAN_FRONTEND=noninteractive

# ── Packages ────────────────────────────────────────────────────────
# chromium = RPi OS flavour of chromium (hardware-accelerated)
# xinit/xserver-xorg: Wayland via cage is an option but Xorg is more
# predictable on RPi 5 today. Revisit after the image stabilises.
apt-get update
apt-get install -y --no-install-recommends \
    chromium \
    xserver-xorg \
    xinit \
    unclutter \
    plymouth \
    plymouth-themes \
    fonts-noto-color-emoji

# ── /etc/systemd/system/sprixe-kiosk.service ────────────────────────
cat > /etc/systemd/system/sprixe-kiosk.service <<'UNIT'
[Unit]
Description=Sprixe Arcade Kiosk
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=sprixe
Environment=DISPLAY=:0
ExecStartPre=/usr/bin/xinit -- :0 -nocursor &
ExecStartPre=/bin/sleep 2
ExecStartPre=/usr/bin/xset -dpms
ExecStartPre=/usr/bin/xset s off
ExecStart=/usr/bin/chromium \
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
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

# ── /etc/systemd/system/sprixe-watchdog.service + .timer ────────────
cat > /etc/systemd/system/sprixe-watchdog.service <<'UNIT'
[Unit]
Description=Sprixe Kiosk Health Watchdog

[Service]
Type=oneshot
ExecStart=/usr/local/bin/sprixe-watchdog.sh
UNIT

cat > /etc/systemd/system/sprixe-watchdog.timer <<'UNIT'
[Unit]
Description=Run Sprixe watchdog every 30s

[Timer]
OnBootSec=60s
OnUnitActiveSec=30s
Unit=sprixe-watchdog.service

[Install]
WantedBy=timers.target
UNIT

# ── /usr/local/bin/sprixe-watchdog.sh ───────────────────────────────
cat > /usr/local/bin/sprixe-watchdog.sh <<'SCRIPT'
#!/bin/bash
# Resets + restarts the kiosk service when systemd parks it in the
# 'failed' state after exhausting Restart=always's budget.
set -eu
UNIT=sprixe-kiosk.service
if systemctl is-failed --quiet "$UNIT"; then
    logger -t sprixe-watchdog "$UNIT is failed — resetting and restarting"
    systemctl reset-failed "$UNIT"
    systemctl restart "$UNIT"
elif ! systemctl is-active --quiet "$UNIT"; then
    logger -t sprixe-watchdog "$UNIT is inactive — starting"
    systemctl start "$UNIT"
fi
SCRIPT
chmod 755 /usr/local/bin/sprixe-watchdog.sh

# ── Autologin for user 'sprixe' on tty1 ─────────────────────────────
install -d -m 755 /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf <<'CONF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin sprixe --noclear %I $TERM
CONF

# ── Trim services irrelevant to a kiosk appliance ───────────────────
# Silently shrug on units that aren't installed (e.g. ModemManager on
# Lite, hciuart on a board without bluetooth).
for svc in \
    bluetooth.service hciuart.service \
    avahi-daemon.service ModemManager.service \
    apt-daily.service apt-daily.timer apt-daily-upgrade.timer
do
    systemctl disable --now "$svc" 2>/dev/null || true
done

# ── Enable Sprixe stack + reboot ────────────────────────────────────
systemctl daemon-reload
systemctl enable sprixe-kiosk.service
systemctl enable sprixe-watchdog.timer

touch "$MARKER"

echo "sprixe-first-boot: provisioning complete — rebooting into the kiosk"
reboot
