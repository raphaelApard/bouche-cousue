# Bouche Cousue

*[Version française](README.fr.md) · "bouche cousue" is French for "lips sealed"*

A cartoon that only plays while the child's mouth stays closed.

Bouche Cousue turns lip closure into a game. The film rolls while the lips are
touching; it gently warns, then pauses, when the mouth falls open. Closing the
mouth brings the film straight back, with a small "Well done!" flash.

Everything runs in the browser, on the machine in front of you — no build step,
no dependencies to install, no server, no account, no data collection.

## Why

Children with **facial hypotonia** (low muscle tone in the face) often keep the
mouth open at rest, because holding the lips together takes constant, conscious
effort. Practising lip closure is a routine part of oral-motor work, but it is
repetitive and hard to keep a young child engaged with.

This turns the exercise into something the child *wants* to do: the reward is
immediate, obvious, and entirely in their control — their own cartoon keeps
playing. The adult sets the difficulty and stays in charge of pausing.

It also handles the things that actually happen with small children: hands over
the mouth, a pacifier, or wandering away from the screen all pause the film too.

> **Not a medical device.** This is a play aid, not a therapy or a diagnostic
> tool, and it makes no clinical claims. It is meant to complement work guided
> by a speech and language therapist or other professional — please involve
> them in how, and how much, it gets used.

## Getting started

The app needs a secure context for camera access, and loads its translations
and modules over HTTP, so opening the file directly with `file://` will not
work. Serve it over `http://localhost` (or any HTTPS host):

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

The first launch needs internet to fetch the MediaPipe runtime and face model
from a CDN. After that, detection runs entirely offline and locally.

Then either paste a YouTube link, pick a video file from the computer, or try
the demo mode with no video at all.

## Using it

| Action | What it does |
| --- | --- |
| **Space bar**, or **click the video** | Play / pause by hand |
| **▶ / ⏸ button** | Same, from the playback bar (local files) |
| **⛶ Fullscreen** | Use *this* button — YouTube's own fullscreen breaks detection |
| **FR / EN** | Switch language; the choice is remembered |

A manual pause suspends the mouth detection entirely: the film stays put until
an adult starts it again, whatever the child's lips do.

### Settings

| Setting | Meaning |
| --- | --- |
| **Sensitivity** | How wide the mouth must open to count as open. Higher = stricter. |
| **Warning** | How long the mouth stays open before the gentle warning appears. |
| **Pause** | How long the warning shows before the film actually pauses. |

All settings, plus volume and language, are remembered in the browser between
sessions.

## How it works

MediaPipe **FaceLandmarker** runs on each camera frame. Mouth openness is the
vertical lip gap divided by the face height:

```
openness = distance(landmark 13, landmark 14) / distance(landmark 10, landmark 152)
```

Dividing by face height makes the measure scale-invariant, so the child can lean
in or sit back without changing the result.

Two thresholds, not one: the mouth counts as *open* above the sensitivity
threshold and as *closed* only below 60% of it. Between the two, the previous
state is held. That gap is deliberate — a single threshold makes the film
flicker on and off when the lips hover right at the limit.

Time-based delays then decide what actually happens, so a yawn or a quick word
doesn't stop the film. A **HandLandmarker** pass detects hands covering the
mouth, and a colour heuristic over the mouth region detects a pacifier. If the
hand model fails to load, the rest keeps working.

## Video formats

Local files play through the browser's own decoders, which are pickier than
VLC's:

- **Best:** `.mp4` (H.264 video + AAC audio) or `.webm`
- **Often silent:** `.mkv` — the container is frequently fine, but its audio
  track (AC-3, E-AC-3, DTS) is not something browsers can decode, so the picture
  plays with no sound

To fix a silent file without re-encoding the video:

```sh
ffmpeg -i cartoon.mkv -c:v copy -c:a aac -b:a 192k cartoon.mp4
```

If the picture is missing too, the video is likely H.265/HEVC and needs a real
re-encode (`-c:v libx264 -crf 20 -preset fast`).

## Privacy

- The camera feed is analysed frame by frame in the page and immediately
  discarded. **Nothing is recorded, and no image ever leaves the machine.**
- No account, no tracker, no analytics, no telemetry.
- Local video files are read directly by the browser and never uploaded.
- The only stored data is your settings (sensitivity, delays, volume, language),
  in this browser's `localStorage`.
- One exception: choosing a YouTube video loads it from `youtube-nocookie.com`,
  which then applies its own rules.

There is no build step and nothing is minified — all of the above can be
checked by reading the source in this repository.

## Browser support

Chrome and Edge are the safest choice (WebGPU/GPU delegate and the widest codec
support). Any Chromium browser should work. Firefox and Safari can run the
detection but are more restrictive about video codecs.

## Project layout

```
index.html                  markup only — no inline styles or scripts
css/
  base.css                  design tokens, reset, page defaults
  layout.css                marquee, header, main column, footer
  components.css            badges, buttons, sliders, link bars, coach mark
  stage.css                 video surfaces, welcome panel, veil, camera preview
js/
  main.js                   entry point: boots and wires everything
  config.js                 constants — timings, thresholds, landmarks, keys
  dom.js                    every element handle, resolved once
  storage.js                guarded localStorage access
  i18n.js                   locale loading, translation, DOM binding
  ui.js                     veil, status badge, gauge, reward, fullscreen
  settings.js               the three detection sliders
  detector.js               camera + MediaPipe; produces readings only
  mouth-monitor.js          the state machine and detection loop
  player.js                 media control for local files and YouTube
  playback-controls.js      the playback bar
  source-picker.js          welcome screen, quick bar, file picker
locales/
  en.json, fr.json          all user-facing text
```

Dependencies flow one way — `config`/`dom`/`storage` → `i18n` → `ui`/`player`/
`detector`/`settings` → `mouth-monitor` → `source-picker` → `main` — with no
cycles. `detector.js` only measures, `mouth-monitor.js` only decides, and
`player.js` only plays; keeping those three apart is what makes the rule easy
to reason about.

## Adding a language

1. Copy `locales/fr.json`, name it after the language code, and translate the
   values. Every key must be present — missing ones fall back to French.
2. Add the code to `I18N.SUPPORTED` in `js/config.js`.
3. Add a button to the language switch in `index.html`, with a matching
   `data-locale` attribute.

No JavaScript changes are needed: the interface reads its text from the JSON.
The initial language comes from the browser's preferences, falling back to
French.

## Contributing

Issues and pull requests are welcome. Keep in mind that the user interface is
written for young children — text should stay short, warm, and reassuring in
every language.

## License

_To be chosen — add a `LICENSE` file and state it here._
