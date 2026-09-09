# Bouche Cousue — Chrome extension

The web app plays a cartoon you gave it. This extension does the same job on
somebody else's page: turn it on, and whatever video the tab is playing —
YouTube, a replay site, a video embedded in a blog — runs only while the
child's mouth stays closed.

It is the Firefox add-on, in Chrome. Every file but `manifest.json` and the
icons is byte-identical to `../firefox-extension/`; see **Two builds, one
codebase** below.

## Installing it

The MediaPipe runtime and the models are not in the repository — they are
about 20 MB of binaries. Fetch them once:

```sh
./chrome-extension/fetch-vendor.sh
```

Then load the extension in Chrome:

1. open `chrome://extensions`
2. turn on **Developer mode**, top right
3. **Load unpacked**, and pick the `chrome-extension/` folder
4. pin Bouche Cousue to the toolbar, and click it — the popup opens
5. **Activer** opens a small window: that window holds the camera and does the
   watching. Chrome asks for the camera there; allow it, and Chrome remembers
   the choice for the extension.

**Leave that window open.** Closing it is how you stop the extension — it is
the switch. It can sit behind the video or in a corner; being covered does not
stop it.

Why a window at all: Chrome will not open a camera from a page with no visible
browsing context. The background service worker has none, and a toolbar popup
is destroyed the moment it loses focus — which is the first thing that happens
when a child clicks the video. A small window of its own is the only place the
camera can live and keep living.

## Using it

**Activer**, at the top of the popup, opens the engine window and pauses
whatever is playing: the video starts, like every resume, once the lips touch.
Open mouth, hands over the mouth, a pacifier, or a face that leaves the frame
all stop the video again — first a gentle warning over the picture, then the
pause.

The reading and the three sliders appear in the popup only once it is running:
before that the popup is a switch and nothing else. The camera itself is shown
in the engine window, which is the thing that holds it.

**Désactiver** closes the engine window, gives the pages back and switches the
camera off. So does closing that window yourself.

**Close the popup whenever you like.** It is only a remote control, and it
closes the moment you click the page anyway. The toolbar icon is the thing to
read: in colour while the mouth is being watched, grey when it is not.

## What it touches

- Videos in *every* open tab, not only the one in front: a child who opens a
  second tab is watched there too. Only videos this extension paused are ever
  resumed, so anything an adult had already stopped stays stopped.
- Nothing else on the page. The veil is drawn in a closed shadow root, so the
  page's own styles and scripts cannot see it or be disturbed by it. It shows
  the app's mascot, closing its mouth over and over — the thing to copy, shown
  rather than explained.

## Privacy

Same promise as the app, and the same reason to believe it: the camera stream
is analysed in memory, frame by frame, and discarded. Nothing is recorded,
nothing is uploaded, there is no account and no tracker. The models run
locally — `fetch-vendor.sh` is the only moment anything is downloaded, and the
extension never talks to the network again.

The extension stores three slider positions, and nothing else.

## Two builds, one codebase

Chrome and Firefox differ in three places, and only three:

- **The background.** Chrome runs `background.js` as a service worker,
  Firefox as an event page. It is written to suit both: no DOM, no imports.
- **The API namespace.** Firefox exposes `browser`, Chrome only `chrome`;
  both return promises. `lib/api.js` picks whichever exists, so no other file
  has to care.
- **The icons.** Chrome will not take an SVG in a manifest. `make-icons.sh`
  renders the PNGs from the SVG sources with headless Chrome, so there is no
  image toolchain to install. The SVGs stay the source of truth.

Everything else — the rule, the detection, the copy — is the same file on both
sides. `diff -r -x vendor -x README.md -x manifest.json ../firefox-extension .`
should print nothing, and a change to the rule belongs in both.

## Layout

```
manifest.json        MV3, Chrome 102+
background.js        the switchboard, and the keeper of the engine window
popup/               the remote control — a switch, a preview, three sliders
engine/              the window that holds the camera and applies the rule
lib/                 api · config · storage · i18n · detector · settings · mouth-monitor
content/content.js   pauses videos and draws the veil, decides nothing
locales/fr.json      every user-facing string
icons/               SVG sources plus the PNGs Chrome needs (make-icons.sh)
vendor/              MediaPipe runtime and models (fetch-vendor.sh)
```
