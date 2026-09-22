/**
 * The engine window: the one place Firefox will let this add-on hold a camera.
 *
 * `getUserMedia` fails outright in a background page — `NotAllowedError`, in
 * milliseconds, with no prompt shown and no permission able to rescue it,
 * because media capture needs a document with a visible browsing context. A
 * toolbar popup has one, but it is destroyed the moment it loses focus, and
 * the child is going to click the video. So the camera, the models and the
 * state machine live here, in a small window of their own that outlives every
 * click.
 *
 * It reports through the background script rather than talking to anyone
 * directly: `ui` messages end up in the popup, `page` messages in the tabs.
 */

import { api } from "../lib/api.js";
import { LOOP } from "../lib/config.js";
import { initI18n, t, translateDocument, onLocaleChange, veilText } from "../lib/i18n.js";
import { loadSettings, applySetting } from "../lib/settings.js";
import * as monitor from "../lib/mouth-monitor.js";

const el = {
  cameraVideo: document.getElementById("cameraVideo"),
  gauge: document.getElementById("gauge"),
  mouthLed: document.getElementById("mouthLed"),
  mouthStatus: document.getElementById("mouthStatus"),
  bootError: document.getElementById("bootError"),
  retryButton: document.getElementById("retryButton")
};

/** How long to wait before reaching for the background script again. */
const RECONNECT = 250;

/** This window's id, so a background script that has forgotten us can adopt us. */
let windowId = null;
let port = null;

/** What the popup should show. The gauge stays local: only this window has one. */
const view = {
  running: false,
  statusKey: "status.loading",
  ok: null,
  error: null
};

/** The last view actually sent, so an unchanged frame costs no message. */
let sent = null;
/** The last thing the tabs were told, to replay to a background script reborn. */
let lastPageState = null;

/** Ports die when the background page is suspended; not worth throwing over. */
function post(message) {
  try {
    port?.postMessage(message);
  } catch {
    /* The port dropped between the check and the send. The reconnect covers it. */
  }
}

function sendView() {
  const payload = JSON.stringify(view);
  if (payload === sent) return;
  sent = payload;
  post({ kind: "view", ...view });
}

/**
 * Opens the line to the background script, and reopens it whenever it drops.
 *
 * Firefox suspends an idle background page, which disconnects every port — it
 * happens readily while the models are still loading and no messages are
 * flowing. That is routine, not fatal: connecting again wakes the page. The
 * reborn script remembers nothing, so everything it needs is repeated here.
 */
function connect() {
  port = api.runtime.connect({ name: "engine" });

  port.onMessage.addListener(message => {
    if (message.kind === "setting") applySetting(message.name, message.value);
  });

  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connect, RECONNECT);
  });

  post({ kind: "hello", windowId });
  sent = null;                                        // it has not seen the view
  sendView();
  if (lastPageState) post({ kind: "page", state: lastPageState });
}

/**
 * Traffic is what keeps the background page awake, and during model loading
 * the rule is not yet producing any. This does, from the moment the window
 * opens. It is deliberately not the watchdog's `tick`, which must keep meaning
 * "the detection loop ran".
 */
function startKeepAlive() {
  setInterval(() => post({ kind: "keepalive" }), LOOP.HEARTBEAT);
}

/* ---------- What the adult sees, here and in the popup ---------- */

function paintStatus() {
  el.mouthStatus.textContent = t(view.statusKey);
  el.mouthLed.classList.toggle("is-ok", view.ok === true);
  el.mouthLed.classList.toggle("is-alert", view.ok === false);
}

const ui = {
  cameraVideo: el.cameraVideo,

  /** Translation keys, never sentences — the popup does its own wording. */
  setStatus(key, ok = null) {
    view.statusKey = key;
    if (ok !== null) view.ok = ok;
    paintStatus();
    sendView();
  },

  setGauge(ratio, isOpen) {
    el.gauge.style.width = `${Math.min(1, ratio) * 100}%`;
    el.gauge.style.background = isOpen ? "var(--coral)" : "var(--mint)";
  },

  resetGauge() {
    el.gauge.style.width = "0%";
  },

  failed(error) {
    view.running = false;
    view.statusKey = "status.error";
    view.ok = false;
    view.error = { name: error.name, message: error.message };
    paintStatus();
    el.bootError.textContent = `${t("ext.error")} ${error.message}\n${t("engine.errorHint")}`;
    el.bootError.hidden = false;
    el.retryButton.hidden = false;
    sendView();
  },

  /**
   * Reached when monitoring stops, which is usually this window closing. It is
   * the last thing the popup will hear, so it has to say that nothing is
   * running — otherwise the popup is left showing a rule that has ended.
   */
  idle() {
    view.running = false;
    view.statusKey = "status.waiting";
    view.ok = null;
    paintStatus();
    sendView();
  }
};

/* ---------- What the tabs are told ---------- */

/**
 * Every message carries the watchdog's own wording, so a page can put up that
 * veil by itself once this window has gone quiet.
 */
const page = {
  send(state) {
    lastPageState = { kind: "state", silent: veilText("ext.silent"), ...state };
    post({ kind: "page", state: lastPageState });
  },
  showVeil(prefix, { warning = false } = {}) {
    page.send({ blocked: false, veil: { ...veilText(prefix), warning } });
  },
  hideVeil() {
    page.send({ blocked: false, veil: null });
  },
  pause(prefix, { lost = false } = {}) {
    page.send({ blocked: true, veil: { ...veilText(prefix), lost } });
  },
  play({ reward = false } = {}) {
    page.send({ blocked: false, veil: null, reward: reward ? t("reward") : null });
  },
  release() {
    page.send({ blocked: false, veil: null, off: true });
  },
  heartbeat() {
    post({ kind: "tick" });
  }
};

/* ---------- Lifecycle ---------- */

async function run() {
  el.bootError.hidden = true;
  el.retryButton.hidden = true;

  const started = await monitor.startMonitoring({ ui, page });
  view.running = started;
  sendView();
}

el.retryButton.addEventListener("click", run);

// Closing this window is how an adult stops the whole thing, so let go of the
// camera cleanly rather than leaving the indicator burning.
window.addEventListener("pagehide", () => {
  monitor.stopMonitoring();
});

async function main() {
  windowId = (await api.windows.getCurrent()).id;
  connect();
  startKeepAlive();

  await initI18n();
  await loadSettings();

  onLocaleChange(paintStatus);   // fired once by translateDocument: first render
  translateDocument();

  await run();
}

main().catch(error => {
  console.error(error);
  ui.failed(error);
});
