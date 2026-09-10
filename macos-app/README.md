# Bouche Cousue — macOS app

The web app plays a cartoon you gave it, and the extensions do the same job on
a page in the browser. This one steps back further: it watches the child from
the menu bar and pauses **whatever is playing on the Mac** — Safari, Chrome,
QuickTime, VLC, a streaming app, a video in an app nobody thought about.

Detection, thresholds and delays are the ones the app uses. What differs is
that the film belongs to somebody else's program, so stopping it has to go
through macOS.

## Installing it

The MediaPipe runtime and the models are not in the repository — they are
about 20 MB of binaries. Fetch them once, then install Electron:

```sh
./macos-app/fetch-vendor.sh
cd macos-app && npm install
npm start
```

A face appears in the menu bar. Click it: the panel opens under the icon, with
the switch, the camera picture and the settings.

- **🎬 Activer** starts watching. macOS asks for the camera the first time.
- Clicking anywhere else closes the panel — the rule keeps running. The icon
  fills in while it is watching and is hollow when it is not.
- The ✕ in the corner only puts the panel away; the rule keeps running.
- **⏹ Désactiver** hands the film back: whatever was parked starts playing
  again.
- **Quitter**, at the bottom of the panel, closes the app — which has no dock
  icon, so that button and the icon's right-click menu are the only ways out.

Right-clicking the icon gives the same switch without opening the panel.

## Which player, and which permission

**Lecteur** decides how the film is stopped, and the two channels are not
equal.

**Apple events** — the way Safari, Google Chrome, QuickTime Player and VLC are
driven. They say "pause" and mean it, the app can be asked what it is doing,
and macOS prompts for the permission (Automation) the first time, in a dialog
you answer once. Nothing else is needed.

**A key press** — the only way into a player that answers no Apple events,
Firefox among them. There are two, and they travel by different routes, so a
Mac that ignores one may well answer the other:

- **Touche Espace** types a space into the window in front, exactly as a person
  pauses a video. It is refused if the Finder or Bouche Cousue itself is in
  front, since a space there opens Quick Look or presses a button.
- **Touche lecture/pause** posts the keyboard's own media key, which goes to
  whatever is playing rather than to the front window.

Both cost the same thing: macOS only lets an app press keys for the user if
that app is listed under Confidentialité et sécurité › Accessibilité, and a
refusal is **silent** — the event is swallowed, the script exits happily, and
nothing stops. The app no longer pretends otherwise: without the permission it
refuses to press and says so in the panel, with a button that opens the right
pane.

**Automatique**, the default, picks per command: the player in front if it can
be scripted, the space bar if that player is in front but answers no Apple
event, otherwise the first scriptable player merely open, and the media key
when nothing recognisable is there. So a film in VLC or Safari is stopped with no
Accessibility permission at all. The panel names the player that answered the
last command — *Pilote : VLC* — which is the only way to see what Automatique
chose.

The two browsers need one setting of their own before they will listen:
Safari's **Développement › Autoriser JavaScript depuis les Apple Events**, and
Chrome's **Afficher › Développeur › Autoriser JavaScript depuis les Apple
Events**.

**Firefox is the awkward one.** It answers no Apple events, so only a key
reaches it — Automatique sends it a space while it is in front, which is the
same thing you would press yourself, and that still needs Accessibility. If
Firefox is where the films are, the add-on in `../firefox-extension/` does the
job from inside the browser instead: it veils the page and pauses the tab's own
video, with no system permission of any kind.

**The camera** is asked for once, when you first press Activer — the usual
prompt, under Confidentialité et sécurité › Caméra.

## The media key is a toggle

There is no "pause" key on a Mac keyboard, only play/pause. So the app
remembers what it last asked for and presses only when the answer would change.

That belief has to start somewhere, and it starts by assuming a film is playing
or about to be. Pressing at the moment Activer is clicked would be the wrong
move: usually nothing is playing yet, the press lands on nothing, and the app
is left believing it paused something — after which the child's open mouth
presses nothing and the film runs on. So the rule's opening move parks the film
on screen without touching the player, and the first open mouth is the first
press.

If the two ever do fall out of step — the child hits the space bar, a film ends
— the ▶/⏸ button in the panel presses and flips the belief at once, which puts
them back together. The named players do not have this problem: they can be
told to pause and asked what they are doing.

## A pause that holds

Stopping the film once is not enough: the child can press space, or click play,
and carry on watching with their mouth open. So for as long as the rule says
stop, the order is repeated to the player every second and a half — a film
started again is stopped again before a sentence of it has gone by.

This works on the players driven by Apple events, because those can be told
twice: VLC is asked to pause only *if playing*, and `pause()` on an
already-paused video does nothing. It cannot work on the two key channels — a
toggle pressed again would *start* the film — so with **Touche Espace** or
**Touche lecture/pause**, a determined child can restart the film and watch on
until their mouth next moves. It is one more reason to leave **Lecteur** on
Automatique, which prefers a player it can really hold.

## What the child sees

A card floats over the film: *ferme la bouche*, *reviens vite*, *bravo*. It sits
above fullscreen video, it cannot be clicked, and it says the same sentences as
the web app. Turn it off with **Message à l'écran** if the pause alone is
enough.

## Building the app

```sh
./fetch-vendor.sh   # once — the models are not in the repository
./make-icons.sh     # only after editing one of the SVGs
npm run dist
```

Out come `dist/Bouche Cousue-<version>-arm64.dmg` (~133 MB) and the bundle it
holds, `dist/mac-arm64/Bouche Cousue.app`. `npm run dist` refuses to start if
`vendor/` is missing: a build without the models produces an app that launches
and can never see anything, which is worse than no build at all.

The version in the file name is the `version` field of `package.json` — bump it
there before cutting a release.

For a Mac of the other kind, `npm run dist:universal` builds one bundle holding
both architectures. It is roughly twice the size and takes twice as long.

### Signing, and what happens without it

The build above is unsigned — electron-builder says so and carries on. That is
fine on the machine that built it, but a `.dmg` sent to somebody else arrives
quarantined, and macOS will refuse it until they right-click the app and choose
**Ouvrir** once.

To sign and notarize properly you need a paid Apple developer account, a
**Developer ID Application** certificate in the login keychain, and:

```sh
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # appleid.apple.com
export APPLE_TEAM_ID="XXXXXXXXXX"
npm run dist
```

with `"notarize": true` added to the `mac` block of `package.json`.
electron-builder signs, uploads to Apple and staples the ticket by itself.

### Accessibility, after every build

An app is identified to macOS by its code signature, and an unsigned build gets
a fresh ad-hoc one each time. So the Accessibility permission granted to
**Bouche Cousue** stops applying the moment you rebuild: remove the entry with
**−** in Confidentialité et sécurité › Accessibilité and add the new bundle
again. Signing the app properly is what makes that grant stick across builds.

## Privacy

The camera never leaves the Mac. Frames are analysed in memory and dropped —
nothing is recorded, nothing is uploaded, and the app makes no network requests
at all: the model files ship inside it, which is why `fetch-vendor.sh` exists.
The only thing written to disk is `settings.json` in the app's user-data
folder, holding the three sliders and the two choices below them.

## How it is put together

```
main.js                  the switchboard: windows, menu bar, routing
main/
  media-control.js       how a film gets paused on macOS
  protocol.js            the app:// scheme the windows are served from
  settings-store.js      settings.json, and nothing else
  strings.js             the locale, for the menu bar's own words
preload.cjs              the one door between renderer and main
lib/                     the rule, shared in name and shape with the extensions
  config.js              constants — thresholds, delays, landmarks, keys
  bridge.js              window.p4l, this build's answer to lib/api.js
  storage.js             guarded preference access
  settings.js            the sliders, and what they mean
  i18n.js                locale loading, translation, DOM binding
  detector.js            camera in, readings out
  mouth-monitor.js       the state machine — the extensions' file, code for code
engine/                  the hidden window that holds the camera
panel/                   the menu bar popover
overlay/                 the card the child reads
locales/fr.json          every user-facing string
icons/                   SVG sources, and the PNGs make-icons.sh renders
```

Four things differ from the extensions, each for a reason worth keeping:

- **The camera lives in a window that is never shown.** A menu bar popover is
  hidden — and destroyed — the moment the child clicks the film, so nothing
  that must keep running can live there. The engine window is created with
  `paintWhenInitiallyHidden` and `backgroundThrottling: false`, which is what
  keeps Chromium decoding the stream for a window nobody looks at. The panel
  gets small JPEG stills instead, and only while it is open: a `MediaStream`
  cannot cross from one document to another.
- **The pages are served over `app://`, not `file://`.** ES modules, `fetch`
  for the locale, and the secure context `getUserMedia` insists on — all three
  are refused on `file://` and all three come free on a scheme registered as
  standard and secure. It gives the renderers the same shape of world the
  extensions have under `moz-extension://`.
- **Stopping the film is an Apple event or a key press**, never a `pause()`
  call — see `main/media-control.js`, and the toggle it has to work around.
- **The watchdog parks the film rather than veiling it.** The rule reports in
  once a second; if that stops, the main process pauses the player and says so
  in the panel, because a film playing on unwatched is the one outcome that
  must not happen.

`lib/mouth-monitor.js` is the extensions' file with nothing changed but its
header comment: same states, same dead band, same delays. Only the two sinks
handed to it differ —
`diff firefox-extension/lib/mouth-monitor.js macos-app/lib/mouth-monitor.js`
should show that comment and nothing else. A change to the
rule belongs in all four front ends.
