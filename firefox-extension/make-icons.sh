#!/bin/sh
# Renders the PNG icons Chrome needs from the SVG sources.
#
# Chrome will not take an SVG in `manifest.json` — Firefox will, which is why
# only this half of the repository carries PNGs. The SVGs stay the source of
# truth so the drawing keeps matching the app's mascot; run this after editing
# one of them.
#
# It rasterises with headless Chrome, so it needs no image toolchain at all.
set -eu

CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
HERE=$(cd "$(dirname "$0")" && pwd)
ICONS="$HERE/icons"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

[ -x "$CHROME" ] || { echo "Chrome not found. Set CHROME=/path/to/chrome" >&2; exit 1; }

for name in icon icon-off; do
  for size in 16 32 48 128; do
    cat > "$WORK/page.html" <<HTML
<!DOCTYPE html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent}
img{display:block;width:${size}px;height:${size}px}</style>
<img src="$ICONS/$name.svg" alt="">
HTML
    "$CHROME" --headless --disable-gpu --hide-scrollbars \
      --force-device-scale-factor=1 \
      --default-background-color=00000000 \
      --window-size="$size,$size" \
      --screenshot="$ICONS/$name-$size.png" \
      "file://$WORK/page.html" >/dev/null 2>&1
    echo "  icons/$name-$size.png"
  done
done

echo "Done."
