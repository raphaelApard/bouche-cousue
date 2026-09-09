/**
 * The popup: a remote control, not the machine.
 *
 * This document is destroyed the moment the popup loses focus, so nothing that
 * must keep running can live here. **Activer** opens the engine window, which
 * holds the camera and applies the rule; this file only opens a port, draws
 * whatever view arrives, and sends back what the adult pressed.
 *
 * The camera is shown in the engine window rather than here — that window owns
 * the stream, and a `MediaStream` cannot cross between two documents anyway.
 *
 * The engine talks in translation keys; the wording is chosen here.
 */

import { api } from "../lib/api.js";
import { initI18n, t, translateDocument, onLocaleChange, formatSeconds } from "../lib/i18n.js";
import { RANGES, readSliderValues, storeSetting } from "../lib/settings.js";

const el = {
  bootError: document.getElementById("bootError"),
  tagline: document.getElementById("tagline"),
  live: document.getElementById("live"),
  mouthLed: document.getElementById("mouthLed"),
  mouthStatus: document.getElementById("mouthStatus"),
  powerButton: document.getElementById("powerButton"),
  sensitivity: document.getElementById("sensitivity"),
  warningDelay: document.getElementById("warningDelay"),
  warningDelayValue: document.getElementById("warningDelayValue"),
  pauseDelay: document.getElementById("pauseDelay"),
  pauseDelayValue: document.getElementById("pauseDelayValue")
};

/** The last view the engine sent, and the only state this file trusts. */
let view = { running: false, statusKey: "status.waiting", ok: null, error: null };

const port = api.runtime.connect({ name: "popup" });

/* ---------- Drawing the view ---------- */

function renderStatus() {
  el.mouthStatus.textContent = t(view.statusKey);
  el.mouthLed.classList.toggle("is-ok", view.ok === true);
  el.mouthLed.classList.toggle("is-alert", view.ok === false);
}

function renderButton() {
  el.powerButton.textContent = view.running ? t("ext.stop") : t("ext.start");
  el.powerButton.classList.toggle("is-on", view.running);
  el.powerButton.setAttribute("aria-label", t(view.running ? "ext.stopLabel" : "ext.startLabel"));
}

/**
 * The reading and the sliders appear only once the rule is running: before
 * that there is nothing to report and nothing worth tuning.
 */
function renderVisibility() {
  el.live.hidden = !view.running;
  el.tagline.hidden = view.running;

  // The engine window shows the failure in full, and is the only place that
  // can do anything about it; the popup just says something is wrong.
  const error = view.error;
  el.bootError.hidden = !error;
  if (error) {
    el.bootError.textContent = `${t("ext.error")} ${error.message}\n${t("ext.errorHint")}`;
  }
}

function render() {
  renderButton();
  renderVisibility();
  renderStatus();
}

/* ---------- Listening to the engine ---------- */

port.onMessage.addListener(message => {
  if (message.kind !== "view") return;
  const { kind, ...rest } = message;
  view = rest;
  render();
});

/* ---------- Sending what was pressed ---------- */

el.powerButton.addEventListener("click", () => {
  port.postMessage({ kind: view.running ? "stop" : "start" });
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
    port.postMessage({ kind: "setting", name, value: current });
  });

  return show;
}

/* ---------- Setup ---------- */

async function main() {
  await initI18n();
  const stored = await readSliderValues();

  bindSlider(el.sensitivity, "sensitivity", stored.sensitivity);
  const showWarning = bindSlider(el.warningDelay, "warningDelay", stored.warningDelay, el.warningDelayValue);
  const showPause = bindSlider(el.pauseDelay, "pauseDelay", stored.pauseDelay, el.pauseDelayValue);

  // Fired once by translateDocument(), so this is also the first render.
  onLocaleChange(() => {
    render();
    showWarning(Number(el.warningDelay.value));
    showPause(Number(el.pauseDelay.value));
  });

  translateDocument();
}

main().catch(error => {
  console.error(error);
  el.bootError.textContent = error.message;
  el.bootError.hidden = false;
});
