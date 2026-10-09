#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <tizen-web-app-directory>" >&2
    exit 2
fi

app_dir="$(cd -- "$1" && pwd -P)"
pattern='(^|[^[:alnum:]_$])(let|const|class|async|await)([^[:alnum:]_$]|$)|=>|`'
failed=0

while IFS= read -r file; do
    if grep -nE "$pattern" "$file"; then
        echo "Unsupported syntax candidate in $file" >&2
        failed=1
    fi
done < <(find "$app_dir" -maxdepth 2 -type f -name '*.js' -print | sort)

if [[ "$failed" -ne 0 ]]; then
    exit 1
fi

echo "Tizen app sources contain no flagged post-ES5 syntax."
