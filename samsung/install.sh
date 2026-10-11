#!/usr/bin/env bash
# Install Plx on a Samsung TV that has Developer Mode on.
#   install.sh TV_IP [VERSION | Plx.wgt]
# Without a file it downloads the given (or latest) Plx release.
set -euo pipefail

repo="dragoshont/plx-native"
fail() { printf 'ERROR: %s\n' "$1" >&2; shift; [ $# -eq 0 ] || printf '  %s\n' "$@" >&2; exit 1; }

[ $# -ge 1 ] || fail "Usage: install.sh TV_IP [VERSION | Plx.wgt]"
serial="${1%:26101}:26101"
arg="${2:-}"

for d in "${TIZEN_STUDIO:-}" "$HOME/tizen-studio" /opt/tizen-studio /c/tizen-studio; do
  [ -n "$d" ] && [ -d "$d/tools" ] && PATH="$d/tools:$d/tools/ide/bin:$PATH"
done
if ! command -v sdb >/dev/null || ! command -v tizen >/dev/null; then
  fail "Tizen Studio was not found. Install it (step 2), or set TIZEN_STUDIO=/path/to/tizen-studio."
fi

if [ -f "$arg" ]; then
  wgt="$arg"
else
  version="$arg"
  if [ -z "$version" ]; then
    version="$(curl -fsSL "https://api.github.com/repos/$repo/releases?per_page=30" \
      | grep -o '"tag_name": *"samsung-v[0-9.]*"' | head -n1 | grep -o '[0-9][0-9.]*')" \
      || fail "Could not find the latest Plx release."
  fi
  wgt="$(mktemp -d)/Plx-$version.wgt"
  url="https://github.com/$repo/releases/download/samsung-v$version/Plx-$version.wgt"
  echo "Downloading Plx $version..."
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
  grep -q -- "-11" <<<"$out" && fail "An older Plx is installed with another signature. Delete it on the TV (Apps, gear, Plx, Delete) and run this again."
  fail "Install failed (output above)."
fi
echo "Done. Open Plx from Apps on the TV and sign in at plex.tv/link."
