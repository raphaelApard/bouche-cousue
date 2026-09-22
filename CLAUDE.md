# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A bilingual (French/English) browser app — "Bouche Cousue" — that plays a chosen cartoon only while the child's mouth stays closed, using webcam face landmark detection. It is aimed at children with facial hypotonia, turning lip-closure practice into a game. Everything is client-side: no server code, no framework, and nothing to install — the repository has no dependencies, so `pnpm install` has no work to do. The app runs from the sources it ships; the build exists only to select and verify what gets published, and never to compile anything (see **Building and deploying**).

## Running

Must be served over `http://localhost` or HTTPS. Opening `index.html` with `file://` fails twice over: camera access needs a secure context, and the ES modules plus `locales/*.json` are fetched over HTTP.

```sh
python3 -m http.server 8000   # or: pnpm serve — then visit http://localhost:8000/
```

First launch needs internet for the MediaPipe runtime and models (CDN); detection then runs locally.

## Building and deploying

`pnpm build` runs `scripts/build.mjs`, which copies the site — `index.html`,
`css/`, `js/`, `locales/` and the three favicons — into `dist/`, then runs the
checks under **Verifying changes** against that copy. Nothing is compiled,
bundled or minified: what ships is what you read.

What the build is really for is **selection**. The repository holds three front
ends and only one of them is the site; a web root that received the repository
root would be serving the extensions' sources. Naming the files that make up
the site, in one list, is what keeps that from happening — and gives the deploy
a directory it can mirror with `--delete`. A failing check deletes `dist/`, so
a broken build cannot be uploaded by the next command that happens to run. Add a file to the site and it must go in `SITE_FILES` or
`SITE_DIRS`, or it will not ship.

The deploy script itself is **not committed**: it holds the server coordinates,
and nothing naming the host belongs in a public repo. `scripts/deploy.sh` is
gitignored; `scripts/deploy-sample.sh` is the committed template — the same
file with its Configuration block blanked out. Copy the template to
`scripts/deploy.sh`, fill in the four values, and keep the two in step when
editing the logic. It builds, asks the server that the remote path exists
(rsync would otherwise create the wrong directory and report success while the
site stayed as it was), shows what would change, asks, mirrors, then checks
that the site answers 200.

Two remote paths are excluded from both the transfer and the delete pass, and
the list belongs in the script rather than in anyone's memory: `.well-known/`,
which Let's Encrypt writes into to renew the certificate — and without HTTPS
there is no camera at all — and `.htaccess`, the host's HTTP-to-HTTPS redirect,
which is not in the repository and which a plain mirror would delete.

## Three front ends

The repository holds one idea in three packages. The web app in the root plays
a cartoon you hand it. `firefox-extension/` and `chrome-extension/` apply the
same rule to a video already playing on somebody else's page.

The two extensions are **one program in two packages**: every file but
`manifest.json` and the icons is byte-identical, and `lib/api.js` is what
absorbs `browser` versus `chrome`. Keep them that way —
`diff -r -x vendor -x README.md -x manifest.json -x dist firefox-extension chrome-extension`
must print nothing. `make-package.sh` obeys the same rule rather than escaping
it: it reads which build it is from its own path, so both copies are the same
file.

The extensions share no code with the app at runtime — an extension cannot
import from a web page — but their `lib/` carries the app's modules with the
same names, the same split, and the same detection constants. **A change to the
rule belongs in all three.**

## Architecture

`index.html` holds markup only. Styles live in `css/`, logic in `js/` as ES modules, and all user-facing text in `locales/`. The one inline script is the `<!-- Matomo -->` block in the head — self-hosted page-view statistics on `stats.acolad.net`, which the Privacy section of both READMEs declares. It receives nothing from the camera, nothing else depends on it, and deleting the block is the whole of switching it off. Do not add a second inline script.

Dependencies flow one way, with no cycles:

```
config / dom / storage / mascot / range-fill / layout  →  i18n
                            →  ui / player / detector / settings
                            →  mouth-monitor  →  source-picker  →  main
```

The three-way split is the point of the design and worth preserving: **`detector.js` only measures** (camera frames in, readings out — it never touches the DOM), **`mouth-monitor.js` only decides** (readings in, warnings/pauses/resumes out), and **`player.js` only plays** (it knows nothing about mouths). `ui.js` owns everything visible except the playback bar.

Three things about the interface matter when editing it. It is **bilingual**,
one language at a time: both locale files are loaded at startup so the FR/EN
control can switch without a fetch, the choice is remembered under `p4l.locale`,
and every key must exist in `locales/fr.json` *and* `locales/en.json`. The French
build shows no English and the English build no French. The mascot is drawn
**once**, in `#mascotTemplate` in the markup; `js/mascot.js` stamps copies into
slots and `css/mascot.css` alone decides which of the seven faces a copy shows.
And there is **one breakpoint**, carried as a CSS variable: `--bp-mobile`,
1024px, at the top of `css/base.css` and nowhere else. `js/layout.js` reads it
and puts `is-mobile` or `is-desktop` on `<body>` — one or the other, never both —
and that is what every rule keys off. A media query cannot read a custom
property, so naming the state is what keeps the width a single copy; one written
into an `@media` would be a second, so there are none and the only media queries
left are reduced motion.

`range-fill.js` paints the amber run to the left of a slider's thumb, which a
native range input cannot draw by itself.

**Detection.** `detector.js` loads `FaceLandmarker` (GPU delegate, `VIDEO` mode) plus an optional `HandLandmarker`; if the hand model fails it is left null and the rest keeps working. `readFrame()` returns `null` when the camera frame has not advanced, so the caller skips a tick. Mouth openness is `dist(13, 14) / dist(10, 152)` — lip gap over face height, so it is scale-invariant. `detectPacifier()` is a saturation heuristic over a box around the mouth.

**State machine.** `mouth-monitor.js` holds `currentState` plus entry timestamps in `enteredAt`. Two thresholds gate transitions: `settings.openThreshold` opens, `openThreshold * DETECTION.CLOSE_FACTOR` (0.6×) closes. Between them the previous state is held — this anti-flicker dead band is intentional; do not collapse it to a single threshold. `applyDelays()` then debounces: `settings.warningDelay` before the veil, plus `settings.pauseDelay` before the real pause, `TIMING.RESUME` closed before resuming, `TIMING.FACE_LOST` for a missing face.

The sensitivity slider maps 15–90 → threshold 0.080–0.005 via `SENSITIVITY_BASE - value/1000`; keep that inversion if you touch the control.

**Manual pause.** `manuallyPaused` early-returns from `tick()`, suspending mouth control entirely until an adult restarts playback (▶ button, click on the stage, or space bar). Do not let the mouth logic override it.

## Conventions

Code, comments, and identifiers are **English**. User-facing strings are **never** written inline — they belong in `locales/fr.json` and `locales/en.json` and are read via `t(key)`, or bound in markup with `data-i18n`, `data-i18n-placeholder`, `data-i18n-aria-label`. Every key must be present in both files.

Anything rendered dynamically registers a callback with `onLocaleChange()` and re-renders from state. `translateDocument()` fires those callbacks once at startup, so they are also the first-render path — and the veil tracking *translation keys* (`veilKeys`) rather than printed sentences is what lets a language switch rewrite a pause that is already on screen.

The values in `REASON` double as translation key segments (`warning.<reason>.title`, `status.<reason>`) — renaming one means renaming it in both locale files too.

UI copy targets young children: keep it short, warm, and reassuring.

Landmark indices in `LANDMARK` come from the MediaPipe FaceLandmarker topology; changing them requires consulting that spec.

`localStorage` holds only preferences, under the `p4l.*` keys in `STORAGE_KEYS` — now including `p4l.locale` and `p4l.mirror`. Always read numbers through `readNumberInRange()` and the rest through `readOneOf()`: a missing key reads back as `null`, and neither `Number(null)` — which is `0`, silently valid for any slider whose minimum is 0 — nor `readBoolean()` can tell that apart from a real value. If you ever store more than preferences, update the Privacy section of both READMEs to stay truthful.

## The extensions

Each folder's `README.md` covers installing it. What differs from the app, each
for a reason worth keeping:

- **The runtime is vendored.** An MV3 extension page may only run scripts it
  ships itself, so `fetch-vendor.sh` downloads the MediaPipe runtime and models
  into each `vendor/` (gitignored, ~20 MB apiece) and `manifest.json` grants
  `wasm-unsafe-eval`. The CDN the app uses is not an option there.
- **The rule runs in a window of its own, `engine/`.** Firefox will not open a
  camera from a page with no visible browsing context: a background page is
  refused outright — `NotAllowedError` in milliseconds, and *no* permission
  lifts it, not even a permanent one recorded for the add-on's own origin
  (measured, not assumed). A toolbar popup has a context but is destroyed the
  moment it loses focus, which is the first thing that happens when a child
  clicks the video. So `engine/engine.html` — opened by `background.js` as a
  small `type: "popup"` window — holds the camera, the models and the state
  machine. **Do not move `getUserMedia` into the background or the popup.**
- **`popup/` is a remote control and `background.js` a switchboard.** Neither
  decides anything. The popup opens onto a rule already running, draws the view
  it is sent, and posts back what was pressed; the background relays between
  the popup, the engine window and the tabs, and remembers the last state so a
  tab opened mid-film learns where things stand. Nothing that must survive the
  popup closing may live in `popup/`.
- **The loop is a timer, not `requestAnimationFrame`.** An occluded window can
  have its timers throttled, so the state machine reads the clock rather than
  counting ticks — a slowed loop stays correct, only coarser.
- **The pages hold a watchdog.** The engine reports in once a second with
  `tick`; a tab that stops hearing from it pauses itself rather than play on
  unwatched. Anything that widens `LOOP.HEARTBEAT` has to stay well inside
  `LOOP.WATCHDOG`.
- **Suspension is routine, and survivable.** Firefox suspends an idle
  background page and that drops every port — being connected does *not*
  prevent it (measured: it happens while the models load and no messages
  flow). So the engine window sends a separate `keepalive` from the moment it
  opens, reconnects when the port drops, and reintroduces itself with `hello`
  so a reborn background script adopts its window instead of orphaning it. On
  reconnect it replays its view and the tabs' last state, because the new
  script remembers neither. Never make the engine window close itself on a
  disconnect: that turns a routine suspension into a dead session.
- **`mouth-monitor.js` writes to injected sinks** — `ui` for the engine window
  and, relayed, the popup; `page` for the tabs — instead of importing
  `ui`/`player` directly. Same rule, same transitions; only the side effects
  are handed in. The `ui` sink sends *translation keys*, never sentences: each
  window does its own wording.
- **The toolbar icon is the state display.** `background.js` swaps the `icon-*`
  PNGs for the `icon-off-*` ones; they are the same drawing with every colour
  flattened to its luminance, so keep the two shapes in step. The SVGs are the
  source and the PNGs are generated — Chrome will not take an SVG in a
  manifest, and rather than let the two builds diverge over it, both ship PNGs.
  Run `make-icons.sh` (headless Chrome, no image toolchain) after editing an
  SVG.
- **Nothing reads `tab.url`.** Chrome hides it without the broad "tabs"
  permission, which this add-on has no other use for, so the engine window's id
  is kept in `storage.session` instead — it survives a suspended worker and
  dies with the browser, which is the lifetime of the window it describes.

`content/content.js` decides nothing and holds no copy: every sentence it
prints is translated in the background and travels with the state message,
which is also what a tab opened mid-film replays through `hello`. It does carry
its own veil CSS and a copy of the app's mascot SVG, because a content script
cannot import from the add-on — keep that drawing in step with `index.html`,
since `mascot-close` and its `transform-origin` are pinned to the geometry.
Build the veil with DOM calls, never `innerHTML`: the add-on linter flags the
latter, and an AMO reviewer is right to ask.

## Verifying changes

There is no test suite. `pnpm check` is what stands in for one: it runs the
static checks below against the working tree, and `pnpm build` runs the same
ones against `dist/`, so what is verified is what would ship. They catch most
breakage in a multi-module refactor:

- every local `src`/`href` in `index.html` resolves to a file that was built
- every `byId()` in `js/dom.js` matches an `id` in `index.html`
- every named import exists as an export in the target module, and the graph stays acyclic
- every key referenced via `t()` or `data-i18n*` exists in **both** locale files

A key built from a variable — ``t(`cause.${...}`)`` — cannot be resolved
statically and is not looked for; those are the ones `REASON` names, and why
renaming a value there means renaming it in both locale files by hand.

Neither command opens a browser, so after edits still serve the app and read
the console.

The extension has no console of its own until it is loaded: check it from
`about:debugging`, whose **Inspect** button opens a console per popup, per
background script, and per content script — the background console is the one
that matters, since that is where the rule runs. The same three static checks
apply to each extension, against `popup/popup.html` and its own
`locales/fr.json`. `npx web-ext lint --source-dir=firefox-extension` catches
manifest mistakes and should stay at zero errors — pass the packaging script's
own exclusions, or it also flags the `.sh` files that never reach the zip:

```sh
npx web-ext lint --source-dir=firefox-extension \
  --ignore-files fetch-vendor.sh make-icons.sh make-package.sh README.md 'icons/*.svg'
```

Two warnings survive and are expected, both about `data_collection_permissions`
being newer than `strict_min_version`. For Chrome, loading the unpacked folder
from `chrome://extensions` reports manifest problems the same way.
`make-package.sh` builds the store zip in either folder; it refuses to run
without `vendor/`, since a package without the models installs fine and can
never see anything.
