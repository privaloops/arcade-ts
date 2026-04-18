#!/bin/bash
# Runs inside the debian:bookworm-slim container started by
# test-first-boot.sh. Installs the bare minimum + mocks the side
# effects that would either need PID 1 or hit the network, runs
# first-boot.sh, and asserts the artefacts it was supposed to land.

set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null
apt-get install -y -qq --no-install-recommends passwd >/dev/null

# The autologin drop-in references user 'sprixe'; create it so
# chown / chmod in first-boot.sh succeed.
useradd -m -s /bin/bash sprixe 2>/dev/null || true
# Mirror the groups the real Pi will have — 'seat' is intentionally
# absent on trixie (no group gate), 'video' and 'render' are.
groupadd -f video
groupadd -f render

# Mock commands that would either hit the network (apt), speak to PID
# 1 (systemctl), or reboot the host.
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

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

echo ""
echo "=== file presence ==="
for f in \
    /home/sprixe/start-kiosk.sh \
    /home/sprixe/.bash_profile \
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
echo "=== start-kiosk.sh health ==="
[ -x /home/sprixe/start-kiosk.sh ] \
    || { echo "  not executable" >&2; exit 1; }
sh -n /home/sprixe/start-kiosk.sh \
    || { echo "  syntax error" >&2; exit 1; }
grep -q '^exec cage -d --' /home/sprixe/start-kiosk.sh \
    || { echo "  cage launcher missing" >&2; exit 1; }
grep -q -- '--ozone-platform=wayland' /home/sprixe/start-kiosk.sh \
    || { echo "  Wayland ozone backend missing" >&2; exit 1; }
grep -q -- '--enable-features=SharedArrayBuffer' /home/sprixe/start-kiosk.sh \
    || { echo "  SharedArrayBuffer flag missing" >&2; exit 1; }
grep -q 'sprixe.dev' /home/sprixe/start-kiosk.sh \
    || { echo "  arcade URL drift" >&2; exit 1; }
echo "  OK"

echo ""
echo "=== .bash_profile triggers cage on tty1 only ==="
grep -q 'tty.*tty1' /home/sprixe/.bash_profile \
    || { echo "  tty1 guard missing" >&2; exit 1; }
grep -q 'exec /home/sprixe/start-kiosk.sh' /home/sprixe/.bash_profile \
    || { echo "  exec start-kiosk.sh missing" >&2; exit 1; }
echo "  OK"

echo ""
echo "=== autologin drop-in points at 'sprixe' ==="
grep -q 'autologin sprixe' /etc/systemd/system/getty@tty1.service.d/autologin.conf \
    || { echo "  missing '--autologin sprixe'" >&2; exit 1; }
echo "  OK"

echo ""
echo "=== sprixe in video + render groups ==="
id -nG sprixe | grep -qw video || { echo "  not in video" >&2; exit 1; }
id -nG sprixe | grep -qw render || { echo "  not in render" >&2; exit 1; }
echo "  OK"

echo ""
echo "=== idempotence: re-running short-circuits on marker ==="
OUT=$(bash /first-boot.sh)
echo "$OUT" | grep -q 'already installed' \
    || { echo "  marker guard broken (no short-circuit)" >&2; exit 1; }
echo "  OK"

echo ""
echo "=== all checks pass ==="
