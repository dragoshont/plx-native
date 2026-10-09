#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

if [[ -n "${TIZEN_CLI:-}" ]]; then
    TIZEN="$TIZEN_CLI"
elif command -v tizen >/dev/null 2>&1; then
    TIZEN="$(command -v tizen)"
elif [[ -x "${TIZEN_HOME:-$HOME/tizen-studio}/tools/ide/bin/tizen" ]]; then
    TIZEN="${TIZEN_HOME:-$HOME/tizen-studio}/tools/ide/bin/tizen"
else
    TIZEN=""
fi

if [[ -n "${EM_CLI:-}" ]]; then
    EMULATOR="$EM_CLI"
elif command -v em-cli >/dev/null 2>&1; then
    EMULATOR="$(command -v em-cli)"
elif [[ -x "${TIZEN_HOME:-$HOME/tizen-studio}/tools/emulator/bin/em-cli" ]]; then
    EMULATOR="${TIZEN_HOME:-$HOME/tizen-studio}/tools/emulator/bin/em-cli"
else
    EMULATOR=""
fi

printf 'Repository: %s\n' "$REPO_ROOT"
printf 'Host architecture: %s\n' "$(uname -m)"

if [[ -n "$TIZEN" ]]; then
    printf '\nTizen CLI: %s\n' "$TIZEN"
    "$TIZEN" version
    printf '\nInstalled Samsung TV web templates:\n'
    templates="$("$TIZEN" list web-project)"
    printf '%s\n' "$templates" | grep -E 'tv-samsung-[0-9]|BasicEmptyProject' ||
        printf 'No Samsung TV templates found.\n'
else
    printf '\nTizen CLI: not found (set TIZEN_HOME or TIZEN_CLI)\n'
fi

if [[ -n "$EMULATOR" ]]; then
    printf '\nSamsung emulator CLI: %s\n' "$EMULATOR"
    TERM=dumb "$EMULATOR" list-vm
else
    printf '\nSamsung emulator CLI: not found (set TIZEN_HOME or EM_CLI)\n'
fi

if [[ -z "$TIZEN" || -z "$EMULATOR" ]]; then
    exit 1
fi
