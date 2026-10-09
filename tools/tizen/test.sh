#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
for test in tests/tizen/*.test.js; do
    node "$test"
done
node --check samsung/PlexTv/main.js
for source in samsung/PlexTv/js/*.js; do
    node --check "$source"
done
tools/tizen/check-es5.sh samsung/PlexTv
