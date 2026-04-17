#!/bin/bash -e
# Install systemd units, enable autologin + kiosk service + watchdog timer.

install -m 644 files/sprixe-kiosk.service       "${ROOTFS_DIR}/etc/systemd/system/sprixe-kiosk.service"
install -m 644 files/sprixe-watchdog.service    "${ROOTFS_DIR}/etc/systemd/system/sprixe-watchdog.service"
install -m 644 files/sprixe-watchdog.timer      "${ROOTFS_DIR}/etc/systemd/system/sprixe-watchdog.timer"
install -m 644 files/config.txt                 "${ROOTFS_DIR}/boot/firmware/config.txt"
install -m 644 files/cmdline.txt                "${ROOTFS_DIR}/boot/firmware/cmdline.txt"

on_chroot <<EOF
systemctl enable sprixe-kiosk.service
systemctl enable sprixe-watchdog.timer

mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf <<CONF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin sprixe --noclear %I \$TERM
CONF
EOF
