#!/usr/bin/env bash
# Build, sign and publish a Plx Samsung release.
#   samsung/release.sh VERSION [--no-publish]
# Signs with the private release author certificate (PLX_RELEASE_DIR, default
# ~/.config/plxnative/samsung-release: plx-release-author.p12 + author.pw) and the
# public Tizen default distributor, so the package installs on Developer Mode TVs
# without a Samsung account. Keep the author certificate: updates signed with a
# different one are refused by the TV.
set -euo pipefail

version="${1:-}"; publish=1
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Usage: $0 VERSION [--no-publish]" >&2; exit 2; }
[ "${2:-}" = "--no-publish" ] && publish=0

package_id="PlxNative0"
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(dirname -- "$here")"
key_dir="${PLX_RELEASE_DIR:-$HOME/.config/plxnative/samsung-release}"
studio="${TIZEN_STUDIO:-$HOME/tizen-studio}"
tizen="$studio/tools/ide/bin/tizen"
dist_dir="$studio/tools/certificate-generator/certificates/distributor"
profiles="${TIZEN_STUDIO_DATA:-$HOME/tizen-studio-data}/profile/profiles.xml"

for f in "$tizen" "$key_dir/plx-release-author.p12" "$key_dir/author.pw" \
         "$dist_dir/tizen-distributor-signer.p12" "$dist_dir/tizen-distributor-ca.cer" "$profiles"; do
  [ -e "$f" ] || { echo "Missing: $f" >&2; exit 1; }
done

work="$(mktemp -d)"
cp "$profiles" "$work/profiles.xml.bak"
cleanup() { cp "$work/profiles.xml.bak" "$profiles"; rm -rf "$work"; }
trap cleanup EXIT

"$root/tools/tizen/check-es5.sh" "$here/PlexTv"
mkdir "$work/app"
(cd "$here/PlexTv" && tar --exclude=.buildResult --exclude=tests --exclude='*.wgt' \
  --exclude='signature*.xml' --exclude=author-signature.xml --exclude=.manifest.tmp -cf - .) \
  | (cd "$work/app" && tar -xf -)
sed -i.orig -E \
  -e "s#(<widget [^>]*version=\")[^\"]*\"#\1$version\"#" \
  -e "s#<tizen:application required_version=#<tizen:application id=\"$package_id.Plx\" package=\"$package_id\" required_version=#" \
  "$work/app/config.xml"
rm "$work/app/config.xml.orig"
if ! grep -q "package=\"$package_id\"" "$work/app/config.xml" || ! grep -q "version=\"$version\"" "$work/app/config.xml"; then
  echo "Could not stamp config.xml" >&2; exit 1
fi

# Register a temporary profile; the original profiles.xml is restored on exit.
"$tizen" security-profiles add -n plx-release \
  -a "$key_dir/plx-release-author.p12" -p "$(cat "$key_dir/author.pw")" \
  -d "$dist_dir/tizen-distributor-signer.p12" -dp tizenpkcs12passfordsigner \
  -dc "$dist_dir/tizen-distributor-ca.cer" >/dev/null

"$tizen" build-web -- "$work/app" >/dev/null
mkdir "$work/out"
"$tizen" package -t wgt -s plx-release -o "$work/out" -- "$work/app/.buildResult" >/dev/null
shopt -s nullglob; pkgs=("$work/out"/*.wgt)
[ ${#pkgs[@]} -eq 1 ] || { echo "Packaging produced no .wgt (see ~/tizen-studio-data/cli/logs/cli.log)" >&2; exit 1; }
unzip -l "${pkgs[0]}" | grep -q signature1.xml || { echo "Package is not signed" >&2; exit 1; }

mkdir -p "$here/dist"
out="$here/dist/Plx-$version.wgt"
mv -f "${pkgs[0]}" "$out"
(cd "$here/dist" && shasum -a 256 "Plx-$version.wgt" > "Plx-$version.wgt.sha256")
cat "$out.sha256"

if [ "$publish" = 1 ]; then
  gh release create "samsung-v$version" "$out" "$out.sha256" \
    --repo dragoshont/plx-native --target "$(git -C "$root" rev-parse HEAD)" --prerelease \
    --title "Plx for Samsung $version" \
    --notes "Install: see docs/install-samsung.md. Package $package_id, signed for Developer Mode TVs (no Samsung account needed)."
fi
