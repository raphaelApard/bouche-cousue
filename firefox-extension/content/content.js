/**
 * The page half of the extension: it pauses videos and shows the veil.
 *
 * It decides nothing. Everything it knows arrives as a state message from the
 * engine — including the sentences it prints, which are translated there so
 * that no user-facing string is ever written in this file. Three
 * responsibilities share one file because content scripts are injected as
 * plain scripts, not modules; they are kept apart by the sections below.
 *
 * Runs in every frame, so an embedded player is paused along with the page
 * that hosts it. Only the top frame draws the veil, so nested players do not
 * stack one veil on top of another.
 */

(() => {
  "use strict";

  // Firefox calls it `browser`, Chrome only `chrome`. See `lib/api.js` —
  // a content script cannot import.
  const api = globalThis.browser ?? globalThis.chrome;

  const TOP_FRAME = window.top === window;
  const WATCHDOG_CHECK = 2000;

  /** Last state received from the engine. */
  let state = { blocked: false, veil: null, silent: null };
  /** True once a running engine has spoken to us — nothing happens before that. */
  let armed = false;

  /* ---------- Videos ---------- */

  /**
   * Only ever resumes what it paused itself, so a video an adult had already
   * stopped stays stopped, in this tab and in every other one.
   */
  const pausedByUs = new Set();

  function mediaElements() {
    return document.querySelectorAll("video, audio");
  }

  function pauseAll() {
    for (const media of mediaElements()) {
      if (media.paused) continue;
      media.pause();
      pausedByUs.add(media);
    }
  }

  function resumeAll() {
    for (const media of pausedByUs) {
      if (media.isConnected) media.play().catch(() => { /* autoplay refused */ });
    }
    pausedByUs.clear();
  }

  function anyPlaying() {
    return [...mediaElements()].some(media => !media.paused && !media.ended);
  }

  /**
   * Catches anything that starts playing while the mouth is open — a click on
   * the player's own button, an autoplaying next episode, a video added by a
   * single-page app. Capturing on the document reaches elements that did not
   * exist when this script ran.
   */
  document.addEventListener("play", event => {
    if (!state.blocked) return;
    const media = event.target;
    if (!(media instanceof HTMLMediaElement)) return;
    media.pause();
    pausedByUs.add(media);
  }, true);

  /* ---------- Veil ---------- */

  let host = null;
  let shadow = null;

  const VEIL_CSS = `
    :host { all: initial; }
    .veil {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      padding: 20px;
      box-sizing: border-box;
      text-align: center;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #fff3d9;
      background: rgba(15, 10, 36, 0.9);
      backdrop-filter: blur(6px);
      animation: veil-in 0.3s ease-out;
    }
    .veil--warning {
      background: rgba(15, 10, 36, 0.28);
      backdrop-filter: blur(2px);
      pointer-events: none;   /* a warning only nudges: the page stays usable */
    }
    .veil__title {
      margin: 0;
      font-size: clamp(1.5rem, 4vw, 2.3rem);
      font-weight: 800;
      color: #ffd23f;
    }
    .veil--warning .veil__title { font-size: clamp(1.2rem, 3vw, 1.8rem); }
    .mascot {
      width: clamp(140px, 22vw, 210px);
    }
    .veil--warning .mascot {
      width: clamp(110px, 18vw, 160px);
      opacity: 0.9;
    }
    /* The mascot closes its mouth over and over: the thing to copy, shown
       rather than explained. */
    .mascot__mouth {
      transform-origin: 100px 128px;
      animation: mascot-close 1.8s ease-in-out infinite;
    }
    /* Face gone: the mascot stops encouraging and simply waits. */
    .veil--lost .mascot__mouth {
      animation: none;
      transform: scaleY(0.5);
    }
    @keyframes mascot-close {
      0%   { transform: scaleY(1); }
      45%  { transform: scaleY(0.12); }
      60%  { transform: scaleY(0.12); }
      100% { transform: scaleY(1); }
    }
    .veil__text {
      margin: 0;
      max-width: 32ch;
      font-size: clamp(1rem, 2vw, 1.15rem);
      line-height: 1.5;
    }
    .reward {
      position: fixed;
      top: 8%;
      left: 50%;
      z-index: 2147483647;
      padding: 10px 22px;
      border-radius: 999px;
      background: #4ecdc4;
      color: #0a2a28;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 1.2rem;
      font-weight: 800;
      transform: translateX(-50%);
      animation: reward-pop 1.6s ease-out forwards;
    }
    @keyframes veil-in {
      from { opacity: 0; transform: scale(1.04); }
      to   { opacity: 1; transform: scale(1); }
    }
    @keyframes reward-pop {
      0%   { opacity: 0; transform: translate(-50%, 10px) scale(0.9); }
      20%  { opacity: 1; transform: translate(-50%, 0) scale(1); }
      80%  { opacity: 1; }
      100% { opacity: 0; transform: translate(-50%, -10px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .veil, .reward { animation: none; }
      .mascot__mouth { animation: none; transform: scaleY(0.12); }
    }
  `;

  function ensureHost() {
    if (host?.isConnected) return;
    host = document.createElement("bouche-cousue-veil");
    shadow = host.attachShadow({ mode: "closed" });
    shadow.append(Object.assign(document.createElement("style"), { textContent: VEIL_CSS }));
    attachHost();
  }

  /**
   * A fullscreen video covers everything outside it, so while one is open the
   * veil has to live inside that element to be seen at all.
   */
  function attachHost() {
    if (!host) return;
    (document.fullscreenElement ?? document.documentElement).append(host);
  }

  document.addEventListener("fullscreenchange", attachHost);

  /**
   * The app's mascot, drawn here rather than imported: a content script cannot
   * reach the add-on's own modules. Keep it in step with the copy in
   * `index.html` — the geometry is what the `mascot-close` animation and its
   * `transform-origin` are pinned to.
   */
  const MASCOT_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" class="mascot" viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="86" fill="#FFD23F"/>
      <circle cx="70" cy="82" r="10" fill="#0F0A24"/>
      <circle cx="130" cy="82" r="10" fill="#0F0A24"/>
      <circle cx="73" cy="79" r="3" fill="#fff"/>
      <circle cx="133" cy="79" r="3" fill="#fff"/>
      <ellipse cx="55" cy="112" rx="12" ry="7" fill="#FF9F7A" opacity=".7"/>
      <ellipse cx="145" cy="112" rx="12" ry="7" fill="#FF9F7A" opacity=".7"/>
      <g class="mascot__mouth">
        <ellipse cx="100" cy="128" rx="26" ry="18" fill="#0F0A24"/>
        <ellipse cx="100" cy="134" rx="14" ry="7" fill="#FF6B6B"/>
      </g>
    </svg>`;

  /** Parsed once, then copied — and never through `innerHTML`, which an
      add-on reviewer is right to be suspicious of. */
  let mascotTemplate = null;

  function mascotNode() {
    mascotTemplate ??= new DOMParser()
      .parseFromString(MASCOT_SVG, "image/svg+xml").documentElement;
    return document.importNode(mascotTemplate, true);
  }

  function paragraph(className) {
    const node = document.createElement("p");
    node.className = className;
    return node;
  }

  function renderVeil() {
    if (!TOP_FRAME) return;

    const veil = state.veil;
    if (!veil) {
      shadow?.querySelector(".veil")?.remove();
      return;
    }

    ensureHost();
    let node = shadow.querySelector(".veil");
    if (!node) {
      node = document.createElement("div");
      node.className = "veil";
      node.append(mascotNode(), paragraph("veil__title"), paragraph("veil__text"));
      shadow.append(node);
    }
    node.classList.toggle("veil--warning", Boolean(veil.warning));
    node.classList.toggle("veil--lost", Boolean(veil.lost));
    node.querySelector(".veil__title").textContent = veil.title;
    node.querySelector(".veil__text").textContent = veil.text;
  }

  function flashReward(label) {
    if (!TOP_FRAME || !label) return;
    ensureHost();
    shadow.querySelector(".reward")?.remove();

    const node = document.createElement("div");
    node.className = "reward";
    node.textContent = label;
    node.addEventListener("animationend", () => node.remove());
    shadow.append(node);
  }

  /* ---------- Talking to the engine ---------- */

  function apply(next) {
    if (!next) return;
    armed = !next.off;
    state = next;

    if (state.blocked) pauseAll();
    else resumeAll();

    renderVeil();
    flashReward(next.reward);

    if (next.off) {
      host?.remove();
      host = null;
      shadow = null;
    }
  }

  api.runtime.onMessage.addListener(message => {
    if (message?.kind === "state") apply(message);
  });

  // A tab opened after the engine started still has to learn where things stand.
  api.runtime.sendMessage({ kind: "hello" }).then(apply).catch(() => { /* nothing running yet */ });

  /* ---------- Watchdog ----------
     If the engine stops answering — switched off, crashed, or suspended by the
     browser — nobody is watching the child's mouth any more, so the video
     stops. Asking only while something is actually playing keeps this quiet on
     every other tab. */

  /** True while this page has stopped itself because the engine went silent. */
  let tripped = false;

  async function engineAlive() {
    try {
      return (await api.runtime.sendMessage({ kind: "alive" }))?.alive === true;
    } catch {
      return false;   // no background script listening at all
    }
  }

  /** The state the engine last broadcast, for a page that has fallen behind. */
  async function currentState() {
    try {
      return await api.runtime.sendMessage({ kind: "hello" });
    } catch {
      return null;
    }
  }

  setInterval(async () => {
    if (!armed) return;

    // A frozen tab and a suspended engine both come back. When the engine
    // speaks again, take its word for where things stand rather than staying
    // stopped:
    // it only sends a state on a change, and the change may have been missed.
    if (tripped) {
      if (!await engineAlive()) return;
      tripped = false;
      apply(await currentState() ?? { kind: "state", blocked: false, veil: null, off: true });
      return;
    }

    if (state.blocked || !anyPlaying()) return;
    if (await engineAlive()) return;

    tripped = true;
    state = { ...state, blocked: true, veil: state.silent };
    pauseAll();
    renderVeil();
  }, WATCHDOG_CHECK);

})();
