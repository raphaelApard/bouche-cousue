#!/bin/sh
# Packs this folder into the zip the store wants.
#
# The same script sits in both extension folders and is byte-identical there,
# like every other file but `manifest.json` and the icons — it works out which
# build it belongs to from its own path, so neither copy has to differ.
#
# Firefox takes this zip on addons.mozilla.org, listed or unlisted; Chrome
# takes it in the Web Store dashboard. Nothing here signs anything: signing is
# the store's job, and for Firefox it is what turns the zip into an .xpi.
#
# Left out of the package: the two shell scripts, the README and the SVG
# sources. None is referenced at runtime, and the add-on linter flags loose
# `.sh` files — an AMO reviewer is right to ask why an extension ships one.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
FLAVOUR=${HERE##*/}          # firefox-extension or chrome-extension
FLAVOUR=${FLAVOUR%%-*}       # firefox or chrome

read_key() {
  sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$HERE/manifest.json" | head -1
}

VERSION=$(read_key version)
SLUG=$(read_key name | tr 'A-Z' 'a-z' | tr -c 'a-z0-9' '-' | sed 's/--*/-/g; s/^-//; s/-$//')
OUT="$HERE/dist/$SLUG-$FLAVOUR-$VERSION.zip"

# The models are fetched, not committed. A package without them installs fine
# and can never see anything, which is worse than no package at all.
[ -f "$HERE/vendor/models/face_landmarker.task" ] || {
  echo "vendor/ is missing — run ./fetch-vendor.sh first" >&2
  exit 1
}

mkdir -p "$HERE/dist"
rm -f "$OUT"

# `cd` first so the paths inside the zip are relative to the extension root:
# a manifest one folder down is not an extension as far as either store is
# concerned.
cd "$HERE"
zip -qr -X "$OUT" . \
  -x 'dist/*' 'fetch-vendor.sh' 'make-package.sh' 'make-icons.sh' 'README.md' \
     'icons/*.svg' '*.DS_Store' '__MACOSX/*'

echo "$SLUG $FLAVOUR $VERSION"
echo "  $OUT"
echo "  $(du -h "$OUT" | cut -f1), $(unzip -l "$OUT" | tail -1 | awk '{print $2}') files"
