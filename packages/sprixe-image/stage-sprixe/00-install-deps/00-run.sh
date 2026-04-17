#!/bin/bash -e
# Install Chromium + minimal X11 + cursor hider on the RPi image.
# No Node.js, no server — this is a thin client.

on_chroot <<EOF
apt-get update
apt-get install -y --no-install-recommends \
  chromium-browser \
  xserver-xorg \
  xinit \
  unclutter \
  plymouth \
  plymouth-themes \
  fonts-noto-color-emoji
apt-get clean
EOF
