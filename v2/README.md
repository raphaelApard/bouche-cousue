# Petit Cinéma — v2

The app in the repository root, redrawn. Same rule, same detection constants,
a new interface: a cinema at night rather than a page of controls.

It lives beside v1 rather than replacing it, so the two can be served together
and compared. Nothing outside this folder is involved — v1, the two extensions
and the macOS app are untouched.

```sh
python3 -m http.server 8000    # from the repository root
```

Then <http://localhost:8000/v2/>. As with v1 this must be `http://localhost` or
HTTPS: the camera needs a secure context, and the ES modules and `locales/*.json`
are fetched over HTTP. The first launch needs internet for the MediaPipe runtime
and models; detection then runs locally.

## What changed

**The room.** A warm near-black ground, one amber light, and the cat as the only
character. Amber means *action*, coral is *the cat*, green is *all is well*, and
sky blue is the keyboard focus ring — each colour means one thing.

**Two languages, one at a time.** The FR/EN control switches the whole interface;
the French build shows no English and the English build no French. Both locale
files are loaded at startup so switching costs no fetch, the choice is remembered
in `p4l.locale`, and every string is keyed in both files.

**The cat has seven faces** — neutral, warning, paused, delighted, hands over the
mouth, dummy, and gone. The pause veil shows the cause by drawing it, so a child
who cannot read still knows what to do. There is no wording of failure anywhere:
never "wrong", always the thing to do next.

**The warning is a ring, not a countdown in words.** It fills while the film is
still playing, so the time left before it stops is visible without being read.

**The adult's pause is paper, not cinema.** Light background, a padlock, and a
neutral cat — the inversion is the point: a child can tell at a glance that this
pause is not about them. It covers the film and nothing else: the top bar sits
above the stage and stays reachable, because this is the one state where an adult
is certainly the one holding the device. Only the mirror goes, the rule that
reads it being suspended.

**The mirror.** The camera preview is a mirror the child looks into, with the
openness gauge below it and a mark at the exact point the film stops. It keeps
the same size and the same bottom-right corner at every width: one shape to
recognise, whichever screen the child is in front of.

**Leaving the film.** While one is playing, the language pill gives up its place
on the bar to a *Fermer* / *Close* button, and the pair of them are never on it
at once. Watching is a history entry of its own, so the back button — and the
swipe that stands for it on a phone — closes the film rather than leaving the
site. Either way the camera closes with it, which is what the welcome screen
promises.

**The adult panel** is a labelled button — *Réglages* / *Parameters* — that opens
on a plain click and closes on a second click, on Escape, or on a click anywhere
outside it. The link bar behaves the same way.

**Full screen is the film and nothing else.** No top bar, no mirror, no playback
bar — only two things survive: a large lamp, green while the mouth is closed and
amber while it is not, and a labelled button that leaves full screen. The lamp
takes the middle of the top edge, and the corner opposite the button on a narrow
screen, where a notch usually has the middle. The veils still appear; they are
the message, not chrome.

**Windowed, the film keeps its own space.** While a film is playing in a window
the stage is inset by `--band-top` and `--band-bottom`, so the top bar and the
playback bar sit beside the picture rather than over it. Full screen gives that
space back. The mirror stays a floating corner panel, as the design has it.

## Defaults

The three parameters ship at the values the design specifies: sensitivity **0,43**
(threshold `0.048`), **1,5 s** before the warning and **3,0 s** before the pause.

That sensitivity is markedly more forgiving than v1's, which ships pegged at the
strict end of the slider (`0.005` — lips must be all but sealed). If a child needs
that strictness, it is the `value` attribute on `#sensitivity` in `index.html`,
and nothing else.

## Layout

Same shape as v1, with three modules added:

```
config / dom / storage / mascot / range-fill / layout  →  i18n
                                              →  ui / player / detector / settings
                                              →  mouth-monitor  →  source-picker  →  main
```

`detector.js` is byte-identical to v1's. `mouth-monitor.js` holds the same state
machine, the same two thresholds with the dead band between them, and the same
delays; only the side effects it drives are new. The three-way split still holds:
**`detector.js` only measures**, **`mouth-monitor.js` only decides**, **`player.js`
only plays**, and `ui.js` owns everything visible except the playback bar.

`mascot.js` stamps the cat — drawn once, in `#mascotTemplate` in the markup — into
each of its five slots; `css/mascot.css` alone decides which face a copy shows.
`range-fill.js` paints the amber run to the left of a slider's thumb, which a
native range input cannot draw by itself.

`layout.js` reads the three breakpoints — `--bp-narrow`, `--bp-short` and
`--bp-phone`, declared once at the top of `css/base.css` — and puts `is-narrow`,
`is-short` or `is-phone` on `<body>`. Every rule keys off those classes, so no
width is written twice. The indirection is forced: a media query cannot read a
custom property, so naming the state is the only way to keep a single copy. The
only media queries left in this folder are for reduced motion.

## Conventions

Unchanged from the root app, and worth repeating: code, comments and identifiers
are English; user-facing strings are never inline — they live in `locales/fr.json`
and `locales/en.json` and are read through `t()`, or bound in markup with
`data-i18n`, `data-i18n-placeholder` and `data-i18n-aria-label`. Anything rendered dynamically
registers with `onLocaleChange()` and re-renders from state — which is why the
veil tracks *translation keys* rather than printed sentences, and why swapping
language with a pause on screen rewrites it in place.

`localStorage` still holds only preferences, under `p4l.*`, now including
`p4l.locale` and `p4l.mirror`. Read them through `readNumberInRange()` or
`readOneOf()`: a missing key reads back as `null`, and neither `Number(null)`
nor `readBoolean()` can tell that apart from a real value.

## Verifying changes

There is no test suite. Serve the app and check the browser console. The three
static checks from the root `CLAUDE.md` apply here too, against this folder's own
markup and locales:

- every `byId()` in `js/dom.js` matches an `id` in `index.html`
- every named import exists as an export in the target module, and the graph stays acyclic
- every key referenced via `t()` or `data-i18n*` exists in **both** locale files

## Privacy

Unchanged, and the reason to believe it is unchanged: the camera stream is
analysed in memory and discarded. No frame is stored, and none is sent anywhere.
The only things written to the device are the preferences above.
