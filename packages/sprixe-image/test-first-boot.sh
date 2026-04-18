#!/bin/bash
# Smoke-test first-boot.sh inside a Debian Bookworm arm64 container.
# Runs the script end-to-end with apt-get / systemctl / reboot mocked
# out, then asserts that every systemd unit, drop-in and script it
# was supposed to land on the rootfs actually made it — and passes
# `systemd-analyze verify`.
#
# What this catches:
#   - heredoc drift (a unit that doesn't parse)
#   - a file not being chmod'd executable
#   - the autologin drop-in missing the 'sprixe' user
#   - the marker guard failing to land, which would retrigger the
#     installer on every boot
#
# What this does NOT catch:
#   - Chromium / GPU / VideoCore behaviour on the real RPi 5
#   - the actual `apt install chromium` step (we mock it)
# Those stay a manual hardware validation.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLATFORM="${PLATFORM:-linux/arm64}"
IMAGE="${IMAGE:-debian:bookworm-slim}"

# Register arm64 binfmt on Apple Silicon + Intel hosts. Idempotent;
# skipped when the host is already arm64-native.
HOST_ARCH="$(uname -m)"
if [ "$HOST_ARCH" != "aarch64" ] && [ "$HOST_ARCH" != "arm64" ]; then
    docker run --privileged --rm tonistiigi/binfmt --install arm64 >/dev/null
fi

docker run --rm --platform="$PLATFORM" \
    -v "$SCRIPT_DIR/first-boot.sh:/first-boot.sh:ro" \
    -v "$SCRIPT_DIR/test-first-boot-runner.sh:/runner.sh:ro" \
    "$IMAGE" bash /runner.sh
