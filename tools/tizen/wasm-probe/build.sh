#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
    echo "usage: sh build.sh /private/staged/app/probe.wasm" >&2
    exit 2
fi

src=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
mkdir -p "$(dirname -- "$1")"
CARGO_INCREMENTAL=0 rustc +nightly "$src/probe.rs" \
    --edition=2021 --crate-type=cdylib --target=wasm32-unknown-unknown \
    -D warnings -C opt-level=z -C panic=abort \
    -C target-feature=-bulk-memory,-reference-types,-multivalue,-nontrapping-fptoint,-sign-ext,-simd128,-relaxed-simd \
    -o "$1"
