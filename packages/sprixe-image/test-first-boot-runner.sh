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
    /home/sprixe/.xinitrc \
    /home/sprixe/.bash_profile \
    /etc/systemd/system/getty@tty1.service.d/autologin.conf \
    /etc/X11/Xwrapper.config \
    /var/lib/sprixe-installed
do
    if [ ! -e "$f" ]; then
        echo "  MISSING: $f" >&2
        exit 1
    fi
    echo "  ok: $f"
done

echo ""
echo "=== .xinitrc health ==="
[ -x /home/sprixe/.xinitrc ] \
    || { echo "  not executable" >&2; exit 1; }
sh -n /home/sprixe/.xinitrc \
    || { echo "  syntax error" >&2; exit 1; }
grep -q 'sprixe.app/play' /home/sprixe/.xinitrc \
    || { echo "  kiosk URL drift" >&2; exit 1; }
grep -q 'enable-features=SharedArrayBuffer' /home/sprixe/.xinitrc \
    || { echo "  SharedArrayBuffer flag missing" >&2; exit 1; }
grep -q '^exec /usr/bin/chromium' /home/sprixe/.xinitrc \
    || { echo "  chromium not exec'd (would leak X sessions)" >&2; exit 1; }
echo "  OK"

echo ""
echo "=== .bash_profile triggers startx on tty1 only ==="
grep -q 'tty.*tty1' /home/sprixe/.bash_profile \
    || { echo "  tty1 guard missing" >&2; exit 1; }
grep -q 'exec startx' /home/sprixe/.bash_profile \
    || { echo "  exec startx missing" >&2; exit 1; }
echo "  OK"

echo ""
echo "=== autologin drop-in points at 'sprixe' ==="
grep -q 'autologin sprixe' /etc/systemd/system/getty@tty1.service.d/autologin.conf \
    || { echo "  missing '--autologin sprixe'" >&2; exit 1; }
echo "  OK"

echo ""
echo "=== Xwrapper allows non-console user ==="
grep -q 'allowed_users=anybody' /etc/X11/Xwrapper.config \
    || { echo "  Xwrapper would reject sprixe" >&2; exit 1; }
echo "  OK"

echo ""
echo "=== idempotence: re-running short-circuits on marker ==="
OUT=$(bash /first-boot.sh)
echo "$OUT" | grep -q 'already installed' \
    || { echo "  marker guard broken (no short-circuit)" >&2; exit 1; }
echo "  OK"

echo ""
echo "=== all checks pass ==="
