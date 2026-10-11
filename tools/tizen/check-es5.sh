#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <tizen-web-app-directory>" >&2
    exit 2
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
app_dir="$(cd -- "$1" && pwd -P)"
node "$SCRIPT_DIR/check-es5.js" "$app_dir"
