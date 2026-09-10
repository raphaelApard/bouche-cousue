# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A French browser app — "Bouche Cousue" — that plays a chosen cartoon only while the child's mouth stays closed, using webcam face landmark detection. It is aimed at children with facial hypotonia, turning lip-closure practice into a game. Everything is client-side: no build system, no package manager, no server code, no dependencies to install.

## Running

Must be served over `http://localhost` or HTTPS. Opening `index.html` with `file://` fails twice over: camera access needs a secure context, and the ES modules plus `locales/*.json` are fetched over HTTP.

```sh
python3 -m http.server 8000   # then visit http://localhost:8000/
```

First launch needs internet for the MediaPipe runtime and models (CDN); detection then runs locally.

## Four front ends

The repository holds one idea in four packages. The web app in the root plays
a cartoon you hand it. `firefox-extension/` and `chrome-extension/` apply the
same rule to a video already playing on somebody else's page. `macos-app/` is
an Electron menu bar app that applies it to whatever is playing on the Mac, in
whichever application is playing it.

The two extensions are **one program in two packages**: every file but
`manifest.json` and the icons is byte-identical, and `lib/api.js` is what
absorbs `browser` versus `chrome`. Keep them that way —
`diff -r -x vendor -x README.md -x manifest.json firefox-extension chrome-extension`
must print nothing.

The extensions share no code with the app at runtime — an extension cannot
import from a web page — but their `lib/` carries the app's modules with the
same names, the same split, and the same detection constants. `macos-app/lib/`
carries them a third time, for the same reason, with `bridge.js` where the
extensions have `api.js`; its `mouth-monitor.js` is the extensions' file with
nothing changed but the header comment, and it should stay that way. **A change
to the rule belongs in all four.**

## Architecture

`index.html` holds markup only. Styles live in `css/`, logic in `js/` as ES modules, and all user-facing text in `locales/`.

Dependencies flow one way, with no cycles:

```
config / dom / storage  →  i18n  →  ui / player / detector / settings
                                 →  mouth-monitor  →  source-picker  →  main
```

The three-way split is the point of the design and worth preserving: **`detector.js` only measures** (camera frames in, readings out — it never touches the DOM), **`mouth-monitor.js` only decides** (readings in, warnings/pauses/resumes out), and **`player.js` only plays** (it knows nothing about mouths). `ui.js` owns everything visible except the playback bar.

**Detection.** `detector.js` loads `FaceLandmarker` (GPU delegate, `VIDEO` mode) plus an optional `HandLandmarker`; if the hand model fails it is left null and the rest keeps working. `readFrame()` returns `null` when the camera frame has not advanced, so the caller skips a tick. Mouth openness is `dist(13, 14) / dist(10, 152)` — lip gap over face height, so it is scale-invariant. `detectPacifier()` is a saturation heuristic over a box around the mouth.

**State machine.** `mouth-monitor.js` holds `currentState` plus entry timestamps in `enteredAt`. Two thresholds gate transitions: `settings.openThreshold` opens, `openThreshold * DETECTION.CLOSE_FACTOR` (0.6×) closes. Between them the previous state is held — this anti-flicker dead band is intentional; do not collapse it to a single threshold. `applyDelays()` then debounces: `settings.warningDelay` before the veil, plus `settings.pauseDelay` before the real pause, `TIMING.RESUME` closed before resuming, `TIMING.FACE_LOST` for a missing face.

The sensitivity slider maps 15–90 → threshold 0.080–0.005 via `SENSITIVITY_BASE - value/1000`; keep that inversion if you touch the control.

**Manual pause.** `manuallyPaused` early-returns from `tick()`, suspending mouth control entirely until an adult restarts playback (▶ button, click on the stage, or space bar). Do not let the mouth logic override it.

## Conventions

Code, comments, and identifiers are **English**. User-facing strings are **never** written inline — they belong in `locales/fr.json` and are read via `t(key)`, or bound in markup with `data-i18n`, `data-i18n-placeholder`, `data-i18n-aria-label`.

Anything rendered dynamically registers a callback with `onLocaleChange()` and re-renders from state. `translateDocument()` fires those callbacks once at startup, so they are also the first-render path — and the veil tracking *translation keys* (`veilKeys`) rather than printed sentences is what would let a language switch be restored cheaply.

The values in `REASON` double as translation key segments (`warning.<reason>.title`, `status.<reason>`) — renaming one means renaming it in `locales/fr.json` too.

UI copy targets young children: keep it short, warm, and reassuring.

Landmark indices in `LANDMARK` come from the MediaPipe FaceLandmarker topology; changing them requires consulting that spec.

`localStorage` holds only preferences, under the `p4l.*` keys in `STORAGE_KEYS`. Always read numbers through `readNumberInRange()` — a missing key reads back as `null`, and `Number(null)` is `0`, which silently looks valid for any slider whose minimum is 0. If you ever store more than preferences, update the Privacy section of both READMEs to stay truthful.

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

## The macOS app

`macos-app/README.md` covers installing and packaging it. It is a menu bar app:
no dock icon, no window of its own that anybody sees. What differs from the
extensions, each for a reason worth keeping:

- **The camera lives in a window that is never shown.** The menu bar panel is
  hidden — and its document destroyed — the moment it loses focus, which is the
  first thing that happens when a child clicks the film, so nothing that must
  keep running can live in `panel/`. `engine/engine.html` is opened with
  `show: false`, `paintWhenInitiallyHidden: true` and
  `backgroundThrottling: false`: that combination is what keeps Chromium
  decoding a camera nobody is looking at. **Do not move `getUserMedia` into the
  main process or the panel.** The panel is sent small JPEG stills instead
  (`PREVIEW` in config) — a `MediaStream` cannot cross between documents.
- **The pages are served over `app://`, never `file://`** — see
  `main/protocol.js`. ES modules, `fetch` for the locale and the secure context
  `getUserMedia` requires are all refused on `file://`. The handler also stamps
  the CSP, which is why nothing in these pages may be inline.
- **`main/media-control.js` is the whole macOS story.** There is no `pause()`
  to call: either an Apple event goes to one named player (idempotent, needs
  Automation, which macOS prompts for) or the keyboard's play/pause key is
  posted (reaches anything, including Firefox, but needs Accessibility and is
  a *toggle*, so the module tracks what it last asked for). The default target
  is `auto`, which resolves per command — frontmost known player, else one
  merely open, else the key — so the common case never touches Accessibility.
  The frontmost app is read with `lsappinfo`, which costs no permission;
  System Events would cost an Automation prompt to answer the same question.
  There are two key channels: `mediakey` (the system-defined media event, goes
  to whatever is playing) and `space` (a plain key event into the window in
  front, which is how a person pauses Firefox). Same permission, different
  route, so one can work where the other does not. `space` is refused when the
  Finder or this app is in front — a space there opens Quick Look or presses a
  button. A key press is **refused** when the app is not trusted rather than
  sent into the void: `osascript` exits 0 either way, and a press that did
  nothing would leave the belief inverted. The tracked state is why the panel carries a ▶/⏸ button — one
  tap presses and flips the belief, which is how an adult re-syncs the two.
  `arm()` is the other half of that bargain: the rule's opening park must
  **not** reach the player, because pressing a toggle before anything is
  playing leaves the belief inverted and swallows the first real pause
  (measured — it is exactly what "the pause does nothing" looks like). `main.js`
  holds `armed` for that first message.
  Whether that player is open is asked of `pgrep`, never of AppleScript:
  `if application "VLC" is running then tell application "VLC" …` reads as a
  guard and is not one — compiling the `tell` block fetches the app's
  terminology, which launches it (measured). Keep that check out of the
  script.
- **`main.js` is `background.js` in another costume.** It decides nothing about
  mouths: it routes messages, owns the three windows, and turns the rule's
  decisions into Apple events. `panel/` is a remote control and `overlay/`
  holds no copy of its own — every sentence arrives translated from the engine,
  as the extensions' content script is fed.
- **A pause has to be held, not just given.** The state machine speaks on
  transitions, which is enough for a video the app owns — a tab cannot restart
  itself, a child can. So `main.js` repeats the order every `HOLD.INTERVAL`
  while the rule says stop (`media.hold()`). Only Apple events can be repeated:
  they are idempotent, and VLC's is conditional on `playing`. A key channel
  refuses to repeat, because pressing a toggle we believe is stopped would
  start the film — that limitation is real and belongs in the README, not in a
  workaround.
- **The watchdog parks the film instead of veiling it.** No page here belongs
  to us, so a silent engine cannot be answered with a veil: the main process
  pauses the player and says so in the panel and the overlay.
- **Preferences live in `settings.json`** under the app's user-data folder, and
  only preferences. Same `p4l.*` keys, same `numberInRange()` guard.

## Verifying changes

There is no test suite. After edits, serve the app and check the browser console. These static checks catch most breakage in a multi-module refactor:

- every `byId()` in `js/dom.js` matches an `id` in `index.html`
- every named import exists as an export in the target module, and the graph stays acyclic
- every key referenced via `t()` or `data-i18n*` exists in `locales/fr.json`

For the macOS app, `cd macos-app && npm start`; renderer console output reaches
the terminal with `--enable-logging`. The same three static checks apply, in
each of `engine/`, `panel/` and `overlay/` against their own markup and
`locales/fr.json`, plus one more: `main.js`, `main/` and `preload.cjs` may
import from `lib/` only where the module is free of DOM — `config.js` is, the
rest are not.

The extension has no console of its own until it is loaded: check it from
`about:debugging`, whose **Inspect** button opens a console per popup, per
background script, and per content script — the background console is the one
that matters, since that is where the rule runs. The same three static checks
apply to each extension, against `popup/popup.html` and its own
`locales/fr.json`. `npx web-ext lint --source-dir=firefox-extension` catches
manifest mistakes and should stay at zero errors; for Chrome, loading the
unpacked folder from `chrome://extensions` reports manifest problems the same
way.
