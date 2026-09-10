/**
 * The panel under the menu bar: a remote control, not the machine.
 *
 * This window is hidden the moment it loses focus, so nothing that must keep
 * running can live here. **Activer** opens the engine window, which holds the
 * camera and applies the rule; this file draws whatever view arrives, shows
 * the picture the engine sends, and posts back what the adult pressed.
 *
 * The engine talks in translation keys; the wording is chosen here.
 */

import { bridge } from "../lib/bridge.js";
import { TARGETS } from "../lib/config.js";
import { formatSeconds, initI18n, onLocaleChange, t, translateDocument } from "../lib/i18n.js";
import { RANGES, readOptions, readSliderValues, storeSetting } from "../lib/settings.js";

const el = Object.fromEntries(
  ["bootError", "tagline", "live", "previewImage", "gauge", "mouthLed", "mouthStatus", "channelLine",
   "powerButton", "playButton", "closeButton", "quitButton", "sensitivity", "warningDelay",
   "warningDelayValue", "pauseDelay", "pauseDelayValue", "target", "overlay",
   "accessibilityNotice", "accessibilityButton", "playerNotice", "hint"]
    .map(id => [id, document.getElementById(id)])
);

/** The last view the main process sent, and the only state this file trusts. */
let view = {
  running: false,
  playing: false,
  statusKey: "status.waiting",
  ok: null,
  error: null,
  target: "auto",
  channel: null,
  overlayOn: true,
  accessibility: true,
  failure: null
};

/* ---------- Drawing the view ---------- */

function renderStatus() {
  el.mouthStatus.textContent = t(view.statusKey);
  el.mouthLed.classList.toggle("is-ok", view.ok === true);
  el.mouthLed.classList.toggle("is-alert", view.ok === false);
  el.playButton.textContent = view.playing ? "⏸" : "▶";

  // Automatique chooses per command, so the only honest way to show what it
  // chose is to name the player that answered the last one.
  el.channelLine.hidden = !(view.running && view.channel);
  if (view.running && view.channel) {
    el.channelLine.textContent = t("ext.via", { player: t(`targets.${view.channel}`) });
  }
}

function renderButton() {
  el.powerButton.textContent = view.running ? t("ext.stop") : t("ext.start");
  el.powerButton.classList.toggle("is-on", view.running);
  el.powerButton.setAttribute("aria-label", t(view.running ? "ext.stopLabel" : "ext.startLabel"));
}

/**
 * The picture and the sliders appear only once the rule is running: before
 * that there is nothing to report and nothing worth tuning.
 */
function renderVisibility() {
  el.live.hidden = !view.running;
  el.tagline.hidden = view.running;
  el.hint.hidden = !view.running;

  const error = view.error;
  el.bootError.hidden = !error;
  if (error) el.bootError.textContent = `${t("ext.error")} ${error.message}`;

  // The media key is posted as if it came from the keyboard, which macOS only
  // allows an app it has been told to trust. Without that the press is
  // swallowed in silence, so it is worth saying before the film does not stop.
  // `accessibility` is already false only when the key can actually be needed.
  el.accessibilityNotice.hidden = view.accessibility;

  // Already a sentence when it arrives: the main process has the locale too,
  // and it is the one that knows what went wrong.
  el.playerNotice.hidden = !view.failure;
  if (view.failure) el.playerNotice.textContent = view.failure;
}

function renderOptions() {
  el.target.value = view.target;
  el.overlay.checked = view.overlayOn;
}

function render() {
  renderButton();
  renderVisibility();
  renderStatus();
  renderOptions();
}

/* ---------- The picture ---------- */

function renderPreview({ image, gauge }) {
  el.previewImage.src = image;
  el.gauge.style.width = `${gauge.ratio * 100}%`;
  el.gauge.style.background = gauge.open ? "var(--coral)" : "var(--mint)";
}

/* ---------- Listening ---------- */

bridge.on(message => {
  if (message.kind === "view") {
    const { kind, ...rest } = message;
    view = rest;
    render();
    return;
  }
  if (message.kind === "preview") renderPreview(message);
});

/* ---------- Sending what was pressed ---------- */

el.powerButton.addEventListener("click", () => {
  bridge.send({ kind: view.running ? "stop" : "start" });
});

el.playButton.addEventListener("click", () => bridge.send({ kind: "toggle-playback" }));

// The cross dismisses the panel, nothing more: the rule keeps running, and
// Quitter lives in the menu the icon's right click opens.
el.closeButton.addEventListener("click", () => bridge.send({ kind: "close" }));

el.quitButton.addEventListener("click", () => bridge.send({ kind: "quit" }));

el.accessibilityButton.addEventListener("click", () => bridge.send({ kind: "accessibility" }));

el.target.addEventListener("change", () => {
  bridge.send({ kind: "option", name: "target", value: el.target.value });
});

el.overlay.addEventListener("change", () => {
  bridge.send({ kind: "option", name: "overlay", value: el.overlay.checked });
});

/* ---------- The sliders ---------- */

/**
 * Both halves of a setting change: stored here, so it survives, and sent to
 * the engine, which is a different module instance with its own copy.
 */
function bindSlider(slider, name, value, readout) {
  const range = RANGES[name];
  slider.min = range.min;
  slider.max = range.max;
  slider.step = range.step;
  slider.value = value;

  const show = current => {
    if (readout) readout.textContent = formatSeconds(current);
  };
  show(value);

  slider.addEventListener("input", () => {
    const current = Number(slider.value);
    show(current);
    storeSetting(name, current);
    bridge.send({ kind: "setting", name, value: current });
  });

  return show;
}

/** The choice of player is a list of keys; the labels are the locale's. */
function fillTargets() {
  el.target.replaceChildren(...TARGETS.map(id => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = t(`targets.${id}`);
    return option;
  }));
  el.target.value = view.target;
}

/* ---------- Setup ---------- */

/**
 * The window is a popover with no scrollbar: it has to be exactly as tall as
 * what it is showing, and what it is showing changes as the rule starts and
 * stops.
 */
function reportHeight() {
  bridge.send({ kind: "resize", height: document.body.scrollHeight });
}

async function main() {
  await initI18n();
  const stored = await readSliderValues();
  const { target, overlay } = await readOptions();
  view = { ...view, target, overlayOn: overlay };

  bindSlider(el.sensitivity, "sensitivity", stored.sensitivity);
  const showWarning = bindSlider(el.warningDelay, "warningDelay", stored.warningDelay, el.warningDelayValue);
  const showPause = bindSlider(el.pauseDelay, "pauseDelay", stored.pauseDelay, el.pauseDelayValue);

  // Fired once by translateDocument(), so this is also the first render.
  onLocaleChange(() => {
    fillTargets();
    render();
    showWarning(Number(el.warningDelay.value));
    showPause(Number(el.pauseDelay.value));
  });

  translateDocument();

  new ResizeObserver(reportHeight).observe(document.body);
  reportHeight();
}

main().catch(error => {
  console.error(error);
  el.bootError.textContent = error.message;
  el.bootError.hidden = false;
});
