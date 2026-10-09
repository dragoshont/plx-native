#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
    echo "Usage: $0 <tizen-web-app-directory> <security-profile>" >&2
    exit 2
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
app_dir="$(cd -- "$1" && pwd -P)"
profile="$2"

if [[ ! -f "$app_dir/config.xml" || ! -f "$app_dir/index.html" ]]; then
    echo "Not a Tizen Web app directory: $app_dir" >&2
    exit 1
fi

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

app_name="$(basename -- "$app_dir")"
output_dir="$(dirname -- "$app_dir")/dist"
mkdir -p "$output_dir"
package_dir="$(mktemp -d "$output_dir/.${app_name}.XXXXXX")"
if ! "$TIZEN" package -t wgt -s "$profile" -o "$package_dir" -- "$app_dir"; then
    rmdir "$package_dir" 2>/dev/null || true
    exit 1
fi

shopt -s nullglob
packages=("$package_dir"/*.wgt)
if [[ ${#packages[@]} -ne 1 ]]; then
    echo "Expected one .wgt package in $package_dir; found ${#packages[@]}." >&2
    exit 1
fi

output="$output_dir/$app_name.wgt"
mv -f "${packages[0]}" "$output"
rmdir "$package_dir"
shasum -a 256 "$output"
