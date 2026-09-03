# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A bilingual (FR/EN) browser app — "Bouche Cousue" — that plays a chosen cartoon only while the child's mouth stays closed, using webcam face landmark detection. It is aimed at children with facial hypotonia, turning lip-closure practice into a game. Everything is client-side: no build system, no package manager, no server code, no dependencies to install.

## Running

Must be served over `http://localhost` or HTTPS. Opening `index.html` with `file://` fails twice over: camera access needs a secure context, and the ES modules plus `locales/*.json` are fetched over HTTP.

```sh
python3 -m http.server 8000   # then visit http://localhost:8000/
```

First launch needs internet for the MediaPipe runtime and models (CDN); detection then runs locally.

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

Code, comments, and identifiers are **English**. User-facing strings are **never** written inline — they belong in `locales/*.json` and are read via `t(key)`, or bound in markup with `data-i18n`, `data-i18n-html`, `data-i18n-placeholder`, `data-i18n-aria-label`. Every locale file must define every key.

Anything rendered dynamically must survive a language switch. Register a callback with `onLocaleChange()` and re-render from state, which is why the veil tracks *translation keys* (`veilKeys`) rather than the sentences it printed.

The values in `REASON` double as translation key segments (`warning.<reason>.title`, `status.<reason>`) — renaming one means renaming it across both locale files.

UI copy targets young children: keep it short, warm, and reassuring in every language.

Landmark indices in `LANDMARK` come from the MediaPipe FaceLandmarker topology; changing them requires consulting that spec.

`localStorage` holds only preferences, under the `p4l.*` keys in `STORAGE_KEYS`. Always read numbers through `readNumberInRange()` — a missing key reads back as `null`, and `Number(null)` is `0`, which silently looks valid for any slider whose minimum is 0. If you ever store more than preferences, update the privacy note (`privacy` key) to stay truthful.

## Verifying changes

There is no test suite. After edits, serve the app and check the browser console. These static checks catch most breakage in a multi-module refactor:

- every `byId()` in `js/dom.js` matches an `id` in `index.html`
- every named import exists as an export in the target module, and the graph stays acyclic
- `locales/en.json` and `locales/fr.json` have identical key sets, and every key referenced via `t()` or `data-i18n*` exists
