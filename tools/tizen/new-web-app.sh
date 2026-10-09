#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "Usage: $0 <ProjectName> <parent-directory> [tv-samsung-profile]" >&2
    echo "Example: $0 PlexTv samsung/ tv-samsung-3.0" >&2
}

if [[ $# -lt 2 || $# -gt 3 ]]; then
    usage
    exit 2
fi

name="$1"
parent="$2"
profile="${3:-${TIZEN_TV_PROFILE:-tv-samsung-3.0}}"
template="${TIZEN_WEB_TEMPLATE:-BasicEmptyProject}"

if [[ ! "$name" =~ ^[A-Za-z][A-Za-z0-9]*$ ]]; then
    echo "ProjectName must start with a letter and contain only letters or digits." >&2
    exit 2
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

mkdir -p "$parent"
parent="$(cd -- "$parent" && pwd -P)"
destination="$parent/$name"
if [[ -e "$destination" ]]; then
    echo "Refusing to overwrite existing path: $destination" >&2
    exit 1
fi

"$TIZEN" create web-project \
    -n "$name" \
    -p "$profile" \
    -t "$template" \
    -- "$parent"

if [[ ! -f "$destination/config.xml" || ! -f "$destination/index.html" ]]; then
    echo "Tizen CLI returned without producing the expected web app at $destination." >&2
    exit 1
fi

APP_NAME="$name" perl -0pi -e \
    's{id="http://yourdomain/Template01"}{id="https://example.invalid/$ENV{APP_NAME}"} or die "Unexpected widget id in generated config.xml\n"' \
    "$destination/config.xml"

printf 'Created Samsung Tizen web app: %s\n' "$destination"
printf 'Target profile: %s\n' "$profile"
printf 'Template: %s\n' "$template"
printf 'Widget id: https://example.invalid/%s (replace with an identifier you control before packaging)\n' "$name"
