#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <tizen-web-app-directory>" >&2
    exit 2
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
app_dir="$(cd -- "$1" && pwd -P)"

if [[ -n "${TIZEN_CLI:-}" ]]; then
    TIZEN="$TIZEN_CLI"
elif command -v tizen >/dev/null 2>&1; then
    TIZEN="$(command -v tizen)"
elif [[ -x "${TIZEN_HOME:-$HOME/tizen-studio}/tools/ide/bin/tizen" ]]; then
    TIZEN="${TIZEN_HOME:-$HOME/tizen-studio}/tools/ide/bin/tizen"
else
    echo "Tizen CLI not found; set TIZEN_HOME or TIZEN_CLI." >&2
    exit 1
fi

"$SCRIPT_DIR/check-es5.sh" "$app_dir"
"$TIZEN" build-web -- "$app_dir"
