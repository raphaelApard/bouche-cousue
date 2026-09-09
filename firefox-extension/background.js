/**
 * The switchboard, and the keeper of the engine window.
 *
 * It holds no rules and no camera: the rule runs in `engine/engine.html`, a
 * small window of its own, because Firefox refuses `getUserMedia` in a page
 * with no visible browsing context — a background page fails in milliseconds,
 * whatever permission has been granted. The popup decides nothing either; it
 * is a remote control that comes and goes.
 *
 * So this script carries messages between the three, remembers the last state
 * so a tab opened mid-film learns where things stand, and keeps the toolbar
 * icon telling the truth.
 */

// Firefox calls it `browser`, Chrome only `chrome`; both are promise-based
// here. See `lib/api.js` — this script cannot import.
const api = globalThis.browser ?? globalThis.chrome;

/** How long a silent engine counts as alive; matches `LOOP.WATCHDOG`. */
const WATCHDOG = 8000;

/**
 * The toolbar icon, in both moods. PNG rather than the SVG sources, because
 * Chrome will not take an SVG and Firefox is happy with either — which keeps
 * this file identical in both builds. Regenerate with `make-icons.sh`.
 */
const ICON = {
  on: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
  off: { 16: "icons/icon-off-16.png", 32: "icons/icon-off-32.png", 48: "icons/icon-off-48.png", 128: "icons/icon-off-128.png" }
};

/** A window big enough to aim a camera in, small enough to park. */
const WINDOW = { width: 340, height: 340 };

/** Last state broadcast to the tabs, replayed to tabs that arrive later. */
let snapshot = null;
/** The popup, while one is open. */
let remote = null;
/** The engine window's port, and the window it belongs to. */
let engine = null;
let engineWindowId = null;
/** When the engine last reported in, for the pages' watchdog. */
let lastTick = 0;

/** The resting view: what the popup shows when nothing is running. */
const IDLE_VIEW = { running: false, statusKey: "status.waiting", ok: null, error: null };

/** What the popup would show if it opened right now. */
let view = { ...IDLE_VIEW };

const OFF = { kind: "state", blocked: false, veil: null, silent: null, off: true };

/* ---------- Tabs ---------- */

async function broadcast(message) {
  const tabs = await api.tabs.query({});
  for (const tab of tabs) {
    // Tabs without a content script (about:, the add-on store, a PDF viewer)
    // simply have nobody listening.
    api.tabs.sendMessage(tab.id, message).catch(() => {});
  }
}

/* ---------- Toolbar ---------- */

function setIcon(on) {
  api.action.setIcon({ path: on ? ICON.on : ICON.off });
}

/* ---------- The engine window ---------- */

/** In flight while the window is being created, so two clicks make one window. */
let opening = null;

/**
 * Remembers which window the engine is, across a suspension.
 *
 * The window reintroduces itself on reconnect, but an adult can press Activer
 * in the gap before that, and two windows would then fight over one camera.
 * Session storage survives the worker being torn down and dies with the
 * browser, which is exactly the lifetime of the window it describes.
 *
 * Reading it back beats scanning `windows.getAll` for the engine's URL:
 * Chrome hides `tab.url` unless the add-on asks for the broad "tabs"
 * permission, which this one has no other use for.
 */
function rememberEngineWindow(id) {
  engineWindowId = id;
  api.storage.session?.set({ engineWindowId: id }).catch(() => {});
}

function forgetEngineWindow() {
  engineWindowId = null;
  api.storage.session?.remove("engineWindowId").catch(() => {});
}

/** The remembered window, if it is genuinely still open. */
async function recallEngineWindow() {
  try {
    const { engineWindowId: id } = await api.storage.session.get("engineWindowId");
    if (id === undefined) return null;
    await api.windows.get(id);   // throws if it has since been closed
    return id;
  } catch {
    return null;
  }
}

async function openEngine() {
  if (engineWindowId === null) {
    const remembered = await recallEngineWindow();
    if (remembered !== null) engineWindowId = remembered;
  }

  if (engineWindowId !== null) {
    // Already running: bring it forward rather than opening a second camera.
    api.windows.update(engineWindowId, { focused: true }).catch(() => {});
    return;
  }
  // `windows.create` takes long enough for a second Activer to arrive before
  // the id is recorded, which would open a second window on the same camera.
  if (opening) return opening;

  opening = api.windows.create({
    url: api.runtime.getURL("engine/engine.html"),
    type: "popup",
    width: WINDOW.width,
    height: WINDOW.height
  });

  try {
    rememberEngineWindow((await opening).id);
  } finally {
    opening = null;
  }
}

function closeEngine() {
  if (engineWindowId === null) return;
  api.windows.remove(engineWindowId).catch(() => {});
}

/** Everything that has to be true once no engine is running. */
function engineGone() {
  engine = null;
  forgetEngineWindow();
  snapshot = null;
  view = { ...IDLE_VIEW };
  setIcon(false);
  remote?.postMessage({ kind: "view", ...view });
  broadcast(OFF);
}

// The window is the switch: closing it stops the rule, however it was closed.
api.windows.onRemoved.addListener(id => {
  if (id === engineWindowId) engineGone();
});

/* ---------- Ports ---------- */

api.runtime.onConnect.addListener(port => {
  if (port.name === "engine") return holdEngine(port);
  if (port.name === "popup") return holdPopup(port);
});

function holdEngine(port) {
  engine = port;
  lastTick = Date.now();
  setIcon(true);

  port.onMessage.addListener(message => {
    // A closing window's last words can arrive after `engineGone` has already
    // recorded that it is gone. Whoever is no longer the engine is not heard.
    if (port !== engine) return;

    // A revived background script has forgotten which window the engine is.
    // The window says so on every connect, so it can be adopted rather than
    // orphaned — that is what makes suspension survivable.
    if (message.kind === "hello") {
      rememberEngineWindow(message.windowId);
      return;
    }
    // Sent purely so this page has traffic to stay awake on; nothing to do.
    if (message.kind === "keepalive") return;

    if (message.kind === "tick") {
      lastTick = Date.now();
      return;
    }
    if (message.kind === "view") {
      const { kind, ...rest } = message;
      view = rest;
      setIcon(view.running);
      remote?.postMessage(message);
      return;
    }
    if (message.kind === "page") {
      // The reward is a one-off flash, not part of the state a late tab inherits.
      const { reward, ...rest } = message.state;
      snapshot = rest.off ? null : rest;
      broadcast(message.state);
    }
  });

  // A crashed engine reports nothing; the window closing covers the rest.
  port.onDisconnect.addListener(() => {
    if (engine === port) engine = null;
  });
}

function holdPopup(port) {
  remote = port;
  port.postMessage({ kind: "view", ...view });

  port.onMessage.addListener(message => {
    if (message.kind === "start") return openEngine();
    if (message.kind === "stop") return closeEngine();
    // Everything else is the engine's business, not this script's.
    engine?.postMessage(message);
  });

  port.onDisconnect.addListener(() => {
    if (remote === port) remote = null;
  });
}

/* ---------- The tabs' watchdog ---------- */

/**
 * Answers through `sendResponse`, synchronously, rather than by returning a
 * promise. Firefox understands both; Chrome ignores a returned promise and
 * hands the sender `undefined` — which would tell every tab's watchdog that
 * the engine is dead and leave every video paused for good.
 */
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.kind === "hello") {
    sendResponse(snapshot);
    return;
  }
  if (message?.kind === "alive") {
    sendResponse({
      alive: view.running && engine !== null && Date.now() - lastTick < WATCHDOG
    });
  }
});

// Whatever this page was doing before it was suspended, it knows of no engine
// until one says hello. An engine window that outlived the suspension will
// reconnect within a moment and be adopted; it is not an orphan to be closed.
setIcon(false);
