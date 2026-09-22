# Bouche Cousue — Firefox extension

The web app plays a cartoon you gave it. This extension does the same job on
somebody else's page: turn it on, and whatever video the tab is playing —
YouTube, a replay site, a video embedded in a blog — runs only while the
child's mouth stays closed.

Detection, thresholds and delays are the ones the app uses; the difference is
where the video lives and who owns the pixels.

There is a Chrome build of this same extension in `../chrome-extension/`. Every
file but `manifest.json` and the icons is byte-identical between the two — see
**Two builds, one codebase** at the bottom.

## Installing it

The MediaPipe runtime and the models are not in the repository — they are
about 20 MB of binaries. Fetch them once:

```sh
./firefox-extension/fetch-vendor.sh
```

Then load the extension in Firefox:

1. open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…**, and pick `firefox-extension/manifest.json`
3. click the Bouche Cousue button in the toolbar — the popup opens under it
4. **Activer** opens a small window: that window holds the camera and does the
   watching. Firefox asks for the camera there; tick **Retenir cette
   décision** so it stops asking on every start.

**Leave that window open.** Closing it is how you stop the extension — it is
the switch. It can sit behind the video or in a corner; being covered does not
stop it.

Why a window at all: Firefox will not open a camera from a page with no
visible browsing context. A background page is refused outright — a
`NotAllowedError` in milliseconds, which no permission can lift — and a
toolbar popup is destroyed the moment it loses focus, which is the first thing
that happens when a child clicks the video. A small window of its own is the
only place the camera can live and keep living.

A temporary add-on disappears when Firefox closes. To keep it, the package
has to be signed on [addons.mozilla.org](https://addons.mozilla.org) — it can
be an unlisted add-on, visible to nobody but you.

Firefox may also ask you to allow the extension on the sites you visit; it
needs that to reach the video on the page.

Building the package that gets signed is one script — see
[Packaging it for a store](#packaging-it-for-a-store) below.

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

The three sliders are the app's: how strict the detection is, how long before
the warning, and how long before the pause. They are remembered.

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
  rather than explained. When the face leaves the frame the mascot stops
  encouraging and simply waits.

## If the engine goes quiet

The pages pause themselves when the engine stops reporting in — the window
closed, crashed, or throttled to a standstill — rather than play on unwatched.

Firefox suspends a background script that has been idle for a while, and that
drops every connection — it happens readily while the models are still loading
and no messages are flowing. Being connected is *not* enough to prevent it, so
the engine window sends a keep-alive once a second from the moment it opens,
and reconnects if the connection drops anyway. A revived background script
adopts the window that reintroduces itself rather than treating it as a stray.

If the window itself goes down, every tab pauses itself and the toolbar icon
goes grey — the failure is visible and safe, never a video playing unwatched.

An occluded window can have its timers throttled. That is survivable by
design: the state machine reads the clock rather than counting ticks, so a
slowed loop stays correct, only coarser.

## Packaging it for a store

```sh
./firefox-extension/fetch-vendor.sh     # once — the models are not in the repository
./firefox-extension/make-package.sh
```

Out comes `firefox-extension/dist/bouche-cousue-firefox-<version>.zip`, about 12 MB —
the models are most of it. The two shell scripts, this README and the SVG
sources are left out: none is used at runtime, and a loose `.sh` inside an
extension is something a reviewer is right to ask about.

The version in the file name is the `version` field of `manifest.json`. Bump it
there before every upload; AMO refuses a package whose version it has
already seen.

**Firefox.** Upload the zip to
[addons.mozilla.org](https://addons.mozilla.org/developers/) — as a **listed**
add-on to publish it, or **unlisted** to keep it private and still get a signed
`.xpi` you can install anywhere. Signing is what makes it permanent: an
unsigned add-on loaded from `about:debugging` disappears when Firefox closes.
Run the linter first — it should stay at zero errors:

```sh
npx web-ext lint --source-dir=firefox-extension \
  --ignore-files fetch-vendor.sh make-icons.sh make-package.sh README.md 'icons/*.svg'
```

It reports two warnings and they are expected: `data_collection_permissions` is
newer than the declared `strict_min_version` of 115, where the key is simply
inert. Keeping 115 keeps ESR in range, which is the cheaper of the two costs.

**What both stores will ask about is the camera.** The answer is short and
true: frames are analysed on the device and dropped, nothing is recorded,
nothing is uploaded, and the only thing stored is three slider positions. The
Firefox manifest already declares it — `data_collection_permissions: none`;
Chrome asks for the same thing in the dashboard's privacy section, along with a
justification for `<all_urls>`, which the extension needs to reach the video on
whatever page it is playing.

## Privacy

Same promise as the app, and the same reason to believe it: the camera stream
is analysed in memory, frame by frame, and discarded. Nothing is recorded,
nothing is uploaded, there is no account and no tracker. The models run
locally — `fetch-vendor.sh` is the only moment anything is downloaded, and the
extension never talks to the network again.

The extension stores three slider positions, and nothing else.

## Layout

```
manifest.json        MV3, Firefox 115+
background.js        the switchboard, and the keeper of the engine window
popup/               the remote control — a switch, a preview, three sliders
engine/              the window that holds the camera and applies the rule
lib/                 api · config · storage · i18n · detector · settings · mouth-monitor
content/content.js   pauses videos and draws the veil, decides nothing
locales/fr.json      every user-facing string
icons/               SVG sources plus PNGs — the same drawing, one greyed
vendor/              MediaPipe runtime and models (fetch-vendor.sh)
```

`lib/` keeps the app's split: `detector.js` only measures, `mouth-monitor.js`
only decides, and the page only obeys. What the extension adds is that the
deciding outlives the window that shows it — `mouth-monitor.js` writes to
sinks handed in by `background.js`, so the popup can be thrown away and
rebuilt without the rule ever noticing.

## Two builds, one codebase

`../chrome-extension/` is the same add-on for Chrome. The two differ in three
places, and only three:

- **The background.** Firefox runs `background.js` as an event page, Chrome as
  a service worker. It is written to suit both: no DOM, no imports.
- **The API namespace.** Firefox exposes `browser`, Chrome only `chrome`; both
  return promises. `lib/api.js` picks whichever exists, so no other file has to
  care.
- **The icons.** Chrome will not take an SVG in a manifest, so both builds ship
  the PNGs that `make-icons.sh` renders from the SVG sources. The SVGs stay the
  source of truth.

`diff -r -x vendor -x README.md -x manifest.json . ../chrome-extension` should
print nothing, and a change to the rule belongs in both.
