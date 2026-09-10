#!/bin/sh
# Renders the PNGs from the SVG sources: the two menu bar icons, and the app
# icon electron-builder puts in the .dmg.
#
# The SVGs stay the source of truth so the drawing keeps matching the app's
# mascot; run this after editing one of them. It rasterises with headless
# Chrome and packs the .icns with `iconutil`, so it needs no image toolchain —
# the same trick the extensions use.
set -eu

CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
HERE=$(cd "$(dirname "$0")" && pwd)
ICONS="$HERE/icons"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

[ -x "$CHROME" ] || { echo "Chrome not found. Set CHROME=/path/to/chrome" >&2; exit 1; }

# $1 source svg, $2 pixel size, $3 destination png
render() {
  cat > "$WORK/page.html" <<HTML
<!DOCTYPE html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent}
img{display:block;width:${2}px;height:${2}px}</style>
<img src="$ICONS/$1.svg" alt="">
HTML
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 \
    --default-background-color=00000000 \
    --window-size="$2,$2" \
    --screenshot="$3" \
    "file://$WORK/page.html" >/dev/null 2>&1
}

# The menu bar. `…Template.png` is the name macOS looks for when it decides to
# tint an image itself, and Electron picks up the @2x file beside it.
echo "Menu bar:"
for name in tray tray-off; do
  render "$name" 16 "$ICONS/${name}Template.png"
  render "$name" 32 "$ICONS/${name}Template@2x.png"
  echo "  icons/${name}Template.png, @2x"
done

# The app icon, in every size a .icns carries.
echo "App icon:"
SET="$WORK/app.iconset"
mkdir -p "$SET"
for size in 16 32 128 256 512; do
  render app "$size" "$SET/icon_${size}x${size}.png"
  render app "$((size * 2))" "$SET/icon_${size}x${size}@2x.png"
done
iconutil --convert icns --output "$ICONS/app.icns" "$SET"
echo "  icons/app.icns"

echo "Done."
