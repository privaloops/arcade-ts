#!/bin/bash
# Runs inside the debian:bookworm-slim container started by
# test-first-boot.sh. Installs the bare minimum to get
# `systemd-analyze` + mocks external side-effects, then runs
# first-boot.sh and asserts the result.

set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null
apt-get install -y -qq --no-install-recommends systemd >/dev/null

# Mock commands that would either hit the network (apt), speak to PID
# 1 (systemctl), or reboot the host. Each mock records its args on
# stderr so a failed assertion can be traced back to the call that
# went wrong.
mkdir -p /mock-bin
for cmd in apt-get apt-key systemctl reboot; do
    cat > "/mock-bin/$cmd" <<EOF
#!/bin/bash
echo "[mock-$cmd] \$*" >&2
exit 0
EOF
    chmod +x "/mock-bin/$cmd"
done
export PATH=/mock-bin:$PATH

bash /first-boot.sh

# Restore PATH so the verification calls use the real binaries.
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

echo ""
echo "=== file presence ==="
for f in \
    /etc/systemd/system/sprixe-kiosk.service \
    /etc/systemd/system/sprixe-watchdog.service \
    /etc/systemd/system/sprixe-watchdog.timer \
    /usr/local/bin/sprixe-watchdog.sh \
    /etc/systemd/system/getty@tty1.service.d/autologin.conf \
    /var/lib/sprixe-installed
do
    if [ ! -e "$f" ]; then
        echo "  MISSING: $f" >&2
        exit 1
    fi
    echo "  ok: $f"
done

echo ""
echo "=== watchdog script health ==="
[ -x /usr/local/bin/sprixe-watchdog.sh ] \
    || { echo "  not executable" >&2; exit 1; }
bash -n /usr/local/bin/sprixe-watchdog.sh \
    || { echo "  bash syntax error" >&2; exit 1; }
echo "  exec bit + syntax OK"

echo ""
echo "=== autologin drop-in points at 'sprixe' ==="
grep -q 'autologin sprixe' /etc/systemd/system/getty@tty1.service.d/autologin.conf \
    || { echo "  missing '--autologin sprixe'" >&2; exit 1; }
echo "  OK"

echo ""
echo "=== kiosk service targets the arcade ==="
grep -q 'sprixe.app/play' /etc/systemd/system/sprixe-kiosk.service \
    || { echo "  kiosk URL drift" >&2; exit 1; }
grep -q 'enable-features=SharedArrayBuffer' /etc/systemd/system/sprixe-kiosk.service \
    || { echo "  SharedArrayBuffer flag missing" >&2; exit 1; }
echo "  OK"

echo ""
echo "=== systemd-analyze verify ==="
# Stub binaries the kiosk unit calls — systemd-analyze refuses to
# confirm an ExecStart that points at a missing executable, and we
# mocked apt-get so the real packages never got installed in this
# container.
for b in /usr/bin/chromium-browser /usr/bin/xinit /usr/bin/xset; do
    : > "$b"
    chmod 755 "$b"
done
systemd-analyze verify \
    /etc/systemd/system/sprixe-kiosk.service \
    /etc/systemd/system/sprixe-watchdog.service \
    /etc/systemd/system/sprixe-watchdog.timer

echo ""
echo "=== idempotence: re-running short-circuits on marker ==="
OUT=$(bash /first-boot.sh)
echo "$OUT" | grep -q 'already installed' \
    || { echo "  marker guard broken (no short-circuit)" >&2; exit 1; }
echo "  OK"

echo ""
echo "=== all checks pass ==="
