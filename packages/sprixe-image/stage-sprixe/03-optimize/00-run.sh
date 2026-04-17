#!/bin/bash -e
# Disable services irrelevant to a kiosk appliance to shrink boot time.

on_chroot <<EOF
systemctl disable bluetooth.service      || true
systemctl disable hciuart.service         || true
systemctl disable avahi-daemon.service    || true
systemctl disable apt-daily.service       || true
systemctl disable apt-daily.timer         || true
systemctl disable apt-daily-upgrade.timer || true
systemctl disable ModemManager.service    || true
EOF
