#!/bin/bash -e
# Install the Sprixe Plymouth theme and set it as the default.
#
# NOTE: files/logo.png is intentionally NOT committed — Phase 5 will
# generate the boot logo to match the HTML splash. The install step
# is guarded to skip copying if the file is missing so CI doesn't
# fail during early scaffolding.

THEME_DIR="${ROOTFS_DIR}/usr/share/plymouth/themes/sprixe"
install -d "${THEME_DIR}"
install -m 644 files/sprixe.plymouth "${THEME_DIR}/sprixe.plymouth"
install -m 644 files/sprixe.script   "${THEME_DIR}/sprixe.script"
if [ -f files/logo.png ]; then
  install -m 644 files/logo.png "${THEME_DIR}/logo.png"
fi

on_chroot <<EOF
plymouth-set-default-theme -R sprixe || true
EOF
