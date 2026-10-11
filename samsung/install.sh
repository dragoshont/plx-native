#!/usr/bin/env bash
# Install PlexTv on a Samsung TV that has Developer Mode on.
#   install.sh TV_IP [PlexTv.wgt]
# Without a file it downloads the latest PlexTv.wgt release.
set -euo pipefail

url="https://github.com/dragoshont/plx-native/releases/latest/download/PlexTv.wgt"
fail() { printf 'ERROR: %s\n' "$1" >&2; shift; [ $# -eq 0 ] || printf '  %s\n' "$@" >&2; exit 1; }

[ $# -ge 1 ] || fail "Usage: install.sh TV_IP [PlexTv.wgt]"
serial="${1%:26101}:26101"
wgt="${2:-}"

for d in "${TIZEN_STUDIO:-}" "$HOME/tizen-studio" /opt/tizen-studio /c/tizen-studio; do
  [ -n "$d" ] && [ -d "$d/tools" ] && PATH="$d/tools:$d/tools/ide/bin:$PATH"
done
if ! command -v sdb >/dev/null || ! command -v tizen >/dev/null; then
  fail "Tizen Studio was not found. Install it (step 2), or set TIZEN_STUDIO=/path/to/tizen-studio."
fi

if [ -z "$wgt" ]; then
  wgt="$(mktemp -d)/PlexTv.wgt"
  echo "Downloading PlexTv..."
  curl -fsSL -o "$wgt" "$url" || fail "Download failed: $url"
fi
[ -f "$wgt" ] || fail "File not found: $wgt"

echo "Connecting to the TV..."
sdb connect "$serial" >/dev/null 2>&1 || true
trap 'sdb disconnect "$serial" >/dev/null 2>&1 || true' EXIT
name="$(sdb devices | awk -v s="$serial" '$1==s && $2=="device" {print $3; exit}')"
[ -n "$name" ] || fail "The TV refused the connection." \
  "On the TV: Apps, press 1 2 3 4 5, set Developer Mode On and Host PC IP to this computer's IP." \
  "Then hold the TV's power button until it restarts, and run this again."

echo "Installing on $name..."
out="$(tizen install -n "$wgt" -t "$name" 2>&1)" || true
if ! grep -qi "install completed\|installed successfully" <<<"$out"; then
  echo "$out" >&2
  grep -q -- "-11" <<<"$out" && fail "An older PlexTv is installed with another signature. Delete it on the TV (Apps, gear, Plex, Delete) and run this again."
  fail "Install failed (output above)."
fi
echo "Done. Open Plex from Apps on the TV and sign in at plex.tv/link."
