/**
 * The engine window: where the camera lives and the rule runs.
 *
 * It is never shown. The panel under the menu bar would have been the obvious
 * home for the camera, but a menu bar popover is dismissed — and destroyed —
 * the moment the child clicks the film, and the rule has to outlive that. So
 * the camera, the models and the state machine sit in a window of their own
 * that nobody ever sees, and the panel is sent a picture of what it holds.
 *
 * It talks to the main process only: `view` and `preview` end up in the panel,
 * `player` becomes a pause or a play on whatever is running on the Mac, and
 * `tick` is what stops the film if this window ever goes quiet.
 */

import { bridge } from "../lib/bridge.js";
import { PREVIEW } from "../lib/config.js";
import { initI18n, t, translateDocument, veilText } from "../lib/i18n.js";
import { applySetting, loadSettings } from "../lib/settings.js";
import * as monitor from "../lib/mouth-monitor.js";

const el = {
  cameraVideo: document.getElementById("cameraVideo"),
  previewCanvas: document.getElementById("previewCanvas")
};

/** What the panel should show. */
const view = {
  running: false,
  playing: false,
  statusKey: "status.loading",
  ok: null,
  error: null
};

/** The last view actually sent, so an unchanged frame costs no message. */
let sent = null;

/** The mouth gauge, sent with the picture rather than on its own. */
let gauge = { ratio: 0, open: false };

/** The panel only wants frames while it is on screen. */
let previewWanted = false;
let previewTimer = null;

function sendView() {
  view.playing = monitor.isRunning() && monitor.isPlaying();
  const payload = JSON.stringify(view);
  if (payload === sent) return;
  sent = payload;
  bridge.send({ kind: "view", ...view });
}

/* ---------- The picture the panel shows ---------- */

/**
 * A `MediaStream` cannot cross from one document to another, so the panel gets
 * stills: small, lossy, and only while it is open. Two hundred bytes of JPEG
 * every eighth of a second is a viewfinder, not a video feed.
 */
function sendPreview() {
  const canvas = el.previewCanvas;
  if (!el.cameraVideo.videoWidth) return;

  canvas.width = PREVIEW.WIDTH;
  canvas.height = PREVIEW.HEIGHT;
  const context = canvas.getContext("2d");
  context.drawImage(el.cameraVideo, 0, 0, canvas.width, canvas.height);

  bridge.send({
    kind: "preview",
    image: canvas.toDataURL("image/jpeg", PREVIEW.QUALITY),
    gauge
  });
}

function setPreview(on) {
  previewWanted = on;
  clearInterval(previewTimer);
  previewTimer = on ? setInterval(sendPreview, PREVIEW.INTERVAL) : null;
  if (on) sendPreview();
}

/* ---------- What the adult sees, in the panel ---------- */

const ui = {
  cameraVideo: el.cameraVideo,

  /** Translation keys, never sentences — the panel does its own wording. */
  setStatus(key, ok = null) {
    view.statusKey = key;
    if (ok !== null) view.ok = ok;
    sendView();
  },

  setGauge(ratio, isOpen) {
    gauge = { ratio: Math.min(1, ratio), open: isOpen };
  },

  resetGauge() {
    gauge = { ratio: 0, open: false };
  },

  failed(error) {
    view.running = false;
    view.statusKey = "status.error";
    view.ok = false;
    view.error = { name: error.name, message: error.message };
    sendView();
  },

  /** The last thing the panel hears, so it has to say nothing is running. */
  idle() {
    view.running = false;
    view.statusKey = "status.waiting";
    view.ok = null;
    sendView();
  }
};

/* ---------- What happens to the film ---------- */

/**
 * The extensions send this to every tab, which veils its own video. Here there
 * is no page to veil: the main process pauses whatever is playing on the Mac,
 * and the sentences go to the overlay card the child reads. The wording is
 * chosen here, where the locale is loaded, exactly as it is there.
 */
const page = {
  send(state) {
    bridge.send({ kind: "player", state });
  },
  showVeil(prefix, { warning = false } = {}) {
    page.send({ blocked: false, notice: { ...veilText(prefix), tone: warning ? "warning" : null } });
  },
  hideVeil() {
    page.send({ blocked: false, notice: null });
  },
  pause(prefix, { lost = false } = {}) {
    page.send({ blocked: true, notice: { ...veilText(prefix), tone: lost ? "lost" : "paused" } });
  },
  play({ reward = false } = {}) {
    page.send({ blocked: false, notice: null, reward: reward ? t("reward") : null });
  },
  release() {
    page.send({ blocked: false, notice: null, off: true });
  },
  heartbeat() {
    bridge.send({ kind: "tick" });
  }
};

/* ---------- Orders from the panel ---------- */

bridge.on(message => {
  if (message.kind === "setting") return applySetting(message.name, message.value);
  if (message.kind === "preview") return setPreview(message.on);
  if (message.kind === "toggle-playback") return monitor.togglePlayback();
});

/* ---------- Lifecycle ---------- */

// Closing this window is how the whole thing stops, so let go of the camera
// cleanly rather than leaving the green light burning.
window.addEventListener("pagehide", () => monitor.stopMonitoring());

async function main() {
  await initI18n();
  await loadSettings();
  translateDocument();

  monitor.onPlaybackChange(sendView);

  const started = await monitor.startMonitoring({ ui, page });
  view.running = started;
  sendView();
  if (previewWanted) setPreview(true);
}

main().catch(error => {
  console.error(error);
  ui.failed(error);
});
