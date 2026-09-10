/**
 * The switchboard, and the keeper of the engine window.
 *
 * It holds no rule and no camera. The rule runs in `engine/engine.html`, a
 * window that is never shown; the panel under the menu bar is a remote control
 * that comes and goes; the overlay is a card the child reads. This process
 * carries messages between the three, turns the rule's decisions into
 * something macOS understands (`main/media-control.js`), and keeps the menu
 * bar icon telling the truth.
 *
 * The shape is the extensions': `background.js` with a different set of
 * windows underneath it.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, session, systemPreferences, Tray }
  from "electron";

import { DEFAULTS, HOLD, LOOP, ORIGIN, OVERLAY, STORAGE_KEYS } from "./lib/config.js";
import * as media from "./main/media-control.js";
import * as store from "./main/settings-store.js";
import { loadStrings, t } from "./main/strings.js";
import { pageURL, registerScheme, serve } from "./main/protocol.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PRELOAD = path.join(ROOT, "preload.cjs");

/** The panel is as wide as a menu bar popover; its height follows its content. */
const PANEL = { width: 320, height: 300, margin: 6 };

/** Big enough for two lines of large type, small enough to sit under a film. */
const CARD = { width: 560, height: 190, bottom: 110 };

const icons = { on: null, off: null };

/** @type {Tray|null} */ let tray = null;
/** @type {BrowserWindow|null} */ let panel = null;
/** @type {BrowserWindow|null} */ let engine = null;
/** @type {BrowserWindow|null} */ let overlay = null;

/** The resting view: what the panel shows when nothing is running. */
const IDLE_VIEW = { running: false, playing: false, statusKey: "status.waiting", ok: null, error: null };

/** What the panel would show if it opened right now. */
let view = { ...IDLE_VIEW };

/**
 * Whether the rule's opening move has been seen. The first state a running
 * engine sends is always its initial park, which must not reach the player —
 * see `arm()` in `main/media-control.js`.
 */
let armed = false;

/** When the engine last reported in, and whether we have given up on it. */
let lastTick = 0;
let silent = false;
let watchdog = null;

/** Set once the quit has been allowed to finish releasing the player. */
let quitting = false;

/* ---------- Talking to the windows ---------- */

/**
 * Whether a window can still be spoken to.
 *
 * A destroyed `BrowserWindow` is still an object, so `overlay?.hide()` sails
 * past the optional chaining and throws `Object has been destroyed`. That is
 * not a hypothetical: closing the app destroys the windows, and the engine's
 * `pagehide` then sends one last `release` on its way out — which arrives to
 * find the overlay already gone.
 */
function alive(window) {
  return window !== null && !window.isDestroyed();
}

function toPanel(message) {
  if (alive(panel)) panel.webContents.send("p4l:message", message);
}

function toEngine(message) {
  if (alive(engine)) engine.webContents.send("p4l:message", message);
}

function toOverlay(message) {
  if (alive(overlay)) overlay.webContents.send("p4l:message", message);
}

/** The panel's whole world: the view, plus what the main process alone knows. */
function pushView() {
  // Some failures are words the module cannot say, only name — it has no
  // locale. `accessibility` is the missing permission, which the panel already
  // has a notice and a button for; the rest becomes a sentence here.
  const failure = media.lastFailure();

  toPanel({
    kind: "view",
    ...view,
    target: media.currentTarget(),
    overlayOn: store.get(STORAGE_KEYS.overlay) !== "false",
    accessibility: media.hasAccessibility() && failure !== "accessibility",
    failure: sentenceFor(failure),
    channel: media.channelUsed()
  });
}

/** Turns what `media-control` reports into something an adult can read. */
function sentenceFor(failure) {
  if (!failure || failure === "accessibility") return null;
  if (failure === "notfront") return t("ext.notFront");
  return `${t("ext.playerError")} ${failure}`;
}

/* ---------- The menu bar ---------- */

function paintTray() {
  if (!tray || tray.isDestroyed()) return;
  tray.setImage(view.running && !silent ? icons.on : icons.off);
  tray.setToolTip(`${t("app.title")} — ${t(view.running ? "status.on" : "status.off")}`);
}

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: t(view.running ? "ext.stop" : "ext.start"), click: () => (view.running ? stopEngine() : startEngine()) },
    { label: t("tray.panel"), click: showPanel },
    { type: "separator" },
    { label: t("tray.quit"), click: () => app.quit() }
  ]);
}

function createTray() {
  const image = name => {
    const icon = nativeImage.createFromPath(path.join(ROOT, "icons", name));
    icon.setTemplateImage(true);   // macOS tints it for the current menu bar
    return icon;
  };
  icons.on = image("trayTemplate.png");
  icons.off = image("tray-offTemplate.png");

  tray = new Tray(icons.off);
  // Left click is the whole interface: it opens the panel, where the switch,
  // the picture and the settings are. Right click is the shortcut for adults
  // in a hurry.
  tray.on("click", togglePanel);
  tray.on("right-click", () => tray.popUpContextMenu(trayMenu()));
  paintTray();
}

/* ---------- The panel ---------- */

function createPanel() {
  panel = new BrowserWindow({
    width: PANEL.width,
    height: PANEL.height,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    roundedCorners: true,
    backgroundColor: "#0f0a24",
    webPreferences: {
      preload: PRELOAD,
      additionalArguments: ["--p4l-role=panel"]
    }
  });

  // An adult reaches for the menu bar while the film is filling the screen, so
  // the panel has to be allowed to appear over a fullscreen app.
  panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenWindows: true });
  panel.loadURL(pageURL("panel/panel.html"));

  // Clicking away is how a popover is dismissed on this platform.
  panel.on("blur", () => {
    if (alive(panel) && !panel.webContents.isDevToolsOpened()) hidePanel();
  });

  panel.on("closed", () => { panel = null; });
}

/**
 * Where the panel should hang from.
 *
 * For the first moment of a launch the icon is not yet laid out in the menu
 * bar, and `getBounds()` answers with nonsense — a height of zero and a `y` at
 * the very bottom of the screen, which drops the panel in the bottom-left
 * corner (measured: `{x: 0, y: 1169, height: 0}` at startup, `{x: 1212, y: 0,
 * height: 39}` a moment later). A menu bar icon always has a height and sits
 * above the work area, so anything else is not an icon yet, and the panel goes
 * to the top right instead — where a menu bar app belongs.
 */
function trayAnchor() {
  const icon = tray.getBounds();
  const { workArea } = screen.getDisplayNearestPoint({ x: icon.x, y: Math.max(icon.y, 0) });
  const { width } = panel.getBounds();

  if (trayPlaced()) {
    const x = Math.round(icon.x + icon.width / 2 - width / 2);
    return {
      x: Math.min(Math.max(x, workArea.x + PANEL.margin), workArea.x + workArea.width - width - PANEL.margin),
      y: Math.round(icon.y + icon.height + PANEL.margin)
    };
  }

  return {
    x: workArea.x + workArea.width - width - PANEL.margin,
    y: workArea.y + PANEL.margin
  };
}

/** Parks the panel under the menu bar icon, inside the screen it belongs to. */
function positionPanel() {
  if (!tray || !alive(panel)) return;
  const { x, y } = trayAnchor();
  panel.setPosition(x, y);
}

function showPanel() {
  if (!alive(panel)) return;
  positionPanel();
  panel.show();
  panel.focus();
  pushView();
  toEngine({ kind: "preview", on: true });   // the viewfinder costs nothing while hidden
}

function hidePanel() {
  if (!alive(panel)) return;
  panel.hide();
  toEngine({ kind: "preview", on: false });
}

function togglePanel() {
  if (!alive(panel)) return;
  if (panel.isVisible()) hidePanel();
  else showPanel();
}

/**
 * Whether the menu bar has actually placed the icon, so that its bounds mean
 * something. Height alone is not enough: it becomes real before the position
 * does, and an icon still reported at the bottom of the screen would hang the
 * panel off the wrong corner.
 */
function trayPlaced() {
  const icon = tray.getBounds();
  if (icon.height <= 0) return false;

  const { workArea } = screen.getDisplayNearestPoint({ x: icon.x, y: Math.max(icon.y, 0) });
  return icon.y < workArea.y;   // a menu bar icon sits above the work area
}

/**
 * Runs `ready` once that has happened.
 *
 * macOS lays the item out a beat after `new Tray` and offers no event for it,
 * so this asks until the answer makes sense — and gives up after two seconds,
 * since the anchor has a sane fallback either way.
 */
function whenTrayPlaced(ready, waited = 0) {
  if (trayPlaced() || waited > 2000) return ready();
  setTimeout(() => whenTrayPlaced(ready, waited + 60), 60);
}

/* ---------- The overlay the child reads ---------- */

function createOverlay() {
  overlay = new BrowserWindow({
    width: CARD.width,
    height: CARD.height,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    focusable: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: PRELOAD,
      additionalArguments: ["--p4l-role=overlay"]
    }
  });

  // It has to float over a film playing fullscreen, and never take a click
  // away from it: this window is a sign, not a control.
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenWindows: true });
  overlay.setIgnoreMouseEvents(true);
  overlay.loadURL(pageURL("overlay/overlay.html"));

  overlay.on("closed", () => { overlay = null; });
}

function positionOverlay() {
  if (!alive(overlay)) return;
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  overlay.setPosition(
    Math.round(workArea.x + workArea.width / 2 - CARD.width / 2),
    Math.round(workArea.y + workArea.height - CARD.height - CARD.bottom)
  );
}

/** Set while a reward is on screen, since a reward takes itself away. */
let flash = null;

/** Running while the film is meant to be parked. See `hold()` in media-control. */
let holding = null;

/**
 * Keeps a parked film parked.
 *
 * The rule speaks only when the mouth changes, which is enough for a video we
 * own — a tab cannot start itself. A child can: press space, click play, and
 * carry on watching with their mouth open. So for as long as the rule says
 * stop, the order is repeated to any player that can be told twice.
 */
function startHold() {
  if (holding) return;
  holding = setInterval(() => media.hold(), HOLD.INTERVAL);
}

function stopHold() {
  clearInterval(holding);
  holding = null;
}

/**
 * Shows what the rule has to say, if the adult left that turned on.
 *
 * @param {{title: string, text: string, tone: string}|null} notice
 * @param {string|null} [reward]  a one-off flash, not a state
 */
function showNotice(notice, reward = null) {
  clearTimeout(flash);
  flash = null;

  if (!alive(overlay)) return;

  if (store.get(STORAGE_KEYS.overlay) === "false" || (!notice && !reward)) {
    overlay.hide();
    return;
  }

  positionOverlay();
  toOverlay({ kind: "notice", notice, reward });
  if (!overlay.isVisible()) overlay.showInactive();

  // "Bravo !" is said and then gone; nothing else follows to take it away.
  if (reward && !notice) {
    flash = setTimeout(() => { if (alive(overlay)) overlay.hide(); }, OVERLAY.FLASH);
  }
}

/* ---------- The engine ---------- */

async function startEngine() {
  if (alive(engine)) {
    pushView();
    return;
  }

  // Asking here rather than in the renderer means the refusal arrives as a
  // sentence the panel can show, instead of a bare `NotAllowedError`.
  const allowed = await systemPreferences.askForMediaAccess("camera");
  if (!allowed) {
    view = { ...IDLE_VIEW, statusKey: "status.error", ok: false, error: { message: t("engine.cameraDenied") } };
    pushView();
    return;
  }

  engine = new BrowserWindow({
    width: 360,
    height: 300,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: PRELOAD,
      additionalArguments: ["--p4l-role=engine"],
      // The camera keeps feeding a window that is never on screen, but only if
      // Chromium is still driving it: `backgroundThrottling` would otherwise
      // slow this window's timers to a crawl the moment it is occluded, and
      // `paintWhenInitiallyHidden` is what makes a window created hidden
      // render at all.
      backgroundThrottling: false,
      paintWhenInitiallyHidden: true
    }
  });

  engine.loadURL(pageURL("engine/engine.html"));
  engine.on("closed", () => {
    engine = null;
    engineGone();
  });

  lastTick = Date.now();
  silent = false;
  armed = false;
  watchdog = setInterval(checkEngine, LOOP.HEARTBEAT);
}

function stopEngine() {
  if (!alive(engine)) return;
  engine.destroy();   // `closed` does the rest
}

/** Everything that has to be true once no engine is running. */
function engineGone() {
  clearInterval(watchdog);
  watchdog = null;
  silent = false;
  stopHold();

  media.release();
  showNotice(null);
  view = { ...IDLE_VIEW };
  paintTray();
  pushView();
}

/**
 * The watchdog. The rule reports in once a second; if that stops — a wedged
 * renderer, a crashed GPU process — the film must not play on unwatched. So
 * the player is parked and the panel says why, and a tick arriving later puts
 * everything back.
 */
function checkEngine() {
  const quiet = Date.now() - lastTick > LOOP.WATCHDOG;
  if (quiet === silent) return;

  silent = quiet;
  if (silent) {
    media.pause();
    startHold();   // nobody is watching the mouth; the film stays put
    view = { ...view, statusKey: "status.silent", ok: false };
    showNotice({ ...noticeText("ext.silent"), tone: "paused" });
  }
  paintTray();
  pushView();
}

/** The two halves of a message, for the few the main process raises itself. */
function noticeText(prefix) {
  return { title: t(`${prefix}.title`), text: t(`${prefix}.text`) };
}

/* ---------- Routing ---------- */

/** What the rule decided, turned into something macOS can be told. */
function handlePlayer(state) {
  if (state.off) {
    stopHold();
    media.release();
    showNotice(null);
    return;
  }

  // The rule opens by parking the film, the way it does in a tab. Here that
  // first message says only "we are watching now": the child still sees the
  // card, but nothing is pressed, because pressing a toggle before knowing
  // what the player is doing is what puts the two out of step for good.
  if (!armed) {
    armed = true;
    media.arm();
    showNotice(state.notice, state.reward);
    return;
  }

  const done = state.blocked ? media.pause() : media.play();
  if (state.blocked) startHold();
  else stopHold();

  // Which player answered — and whether macOS refused the key — is only known
  // once the command has been sent, and the panel says both.
  done.then(pushView);

  showNotice(state.notice, state.reward);
}

function fromEngine(message) {
  if (message.kind === "tick") {
    lastTick = Date.now();
    if (silent) checkEngine();
    return;
  }
  if (message.kind === "view") {
    const { kind, ...rest } = message;
    view = rest;
    paintTray();
    pushView();
    return;
  }
  if (message.kind === "player") {
    handlePlayer(message.state);
    return;
  }
  if (message.kind === "preview") {
    if (panel?.isVisible()) toPanel(message);
  }
}

function fromPanel(message) {
  switch (message.kind) {
    case "start":
      return startEngine();
    case "stop":
      return stopEngine();

    case "option":
      // The two choices the main process acts on itself, rather than the rule.
      store.write(STORAGE_KEYS[message.name], message.value);
      if (message.name === "target") media.setTarget(message.value);
      if (message.name === "overlay" && message.value === false) showNotice(null);
      return pushView();

    case "accessibility":
      // Opens the pane in System Settings; the answer is picked up next time
      // the panel is shown, because macOS only grants this out of process.
      media.hasAccessibility(true);
      return;

    case "resize":
      return sizePanel(message.height);

    case "close":
      // The cross dismisses the panel; the rule keeps running.
      return hidePanel();

    case "quit":
      return app.quit();

    default:
      // Sliders and the ▶/⏸ button are the rule's business, not this file's.
      return toEngine(message);
  }
}

/** The panel measures its own content; the window follows it. */
function sizePanel(height) {
  if (!alive(panel) || !Number.isFinite(height)) return;
  const wanted = Math.round(Math.min(Math.max(height, 160), 720));
  if (panel.getBounds().height === wanted) return;

  panel.setBounds({ ...panel.getBounds(), height: wanted });
  if (panel.isVisible()) positionPanel();
}

ipcMain.on("p4l:message", (event, message) => {
  if (!message || typeof message.kind !== "string") return;

  // On the way out every renderer gets a last word in — the engine releases
  // the camera and the player. There is nothing left to route it to.
  if (quitting) return;

  // A window may only speak for itself: the panel cannot post a view, and the
  // engine cannot change a setting.
  if (engine && event.sender === engine.webContents) return fromEngine(message);
  if (panel && event.sender === panel.webContents) return fromPanel(message);
});

ipcMain.handle("p4l:read-settings", (_event, keys) =>
  Array.isArray(keys) ? store.readAll(keys) : {});

ipcMain.handle("p4l:write-setting", (_event, key, value) => store.write(key, value));

/* ---------- Lifecycle ---------- */

registerScheme();

// One instance, one camera, one menu bar icon.
if (!app.requestSingleInstanceLock()) app.quit();

app.whenReady().then(() => {
  serve(ROOT);
  loadStrings(ROOT);
  store.load();
  media.setTarget(store.get(STORAGE_KEYS.target) ?? DEFAULTS.target);

  // A menu bar app has no dock icon and no menu bar of its own; packaged, that
  // is `LSUIElement` in the Info.plist, and this is the same thing in dev.
  app.dock?.hide();

  // The engine is the only page that asks for anything, and it asks for the
  // camera. Nothing else is granted, whoever asks.
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(permission === "media" && contents.getURL().startsWith(ORIGIN));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission, origin) =>
    permission === "media" && origin === ORIGIN);

  createTray();
  createPanel();
  createOverlay();

  // The first launch shows what the icon does — but only once the icon exists
  // to point at, otherwise the panel opens away from it.
  whenTrayPlaced(showPanel);
});

// Closing the panel is not closing the app: this one lives in the menu bar.
app.on("window-all-closed", () => {});

app.on("second-instance", showPanel);

app.on("before-quit", event => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;

  // Never leave a film parked with nobody left to restart it.
  store.flush();
  media.release().finally(() => app.quit());
});
