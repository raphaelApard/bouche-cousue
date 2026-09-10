/**
 * The overlay: it draws what it is told and nothing else.
 *
 * The web app veils its own stage and the extensions veil the page; on a Mac
 * the film belongs to another application entirely, so the only thing that can
 * be put in front of the child is a window floating above it. The sentences
 * are chosen in the engine, where the locale is loaded, and arrive here ready
 * to show — this file holds no copy of its own.
 */

import { bridge } from "../lib/bridge.js";

const el = {
  card: document.getElementById("card"),
  title: document.getElementById("title"),
  text: document.getElementById("text"),
  mouth: document.getElementById("mascotMouth")
};

/** The mascot's mouth: a line when closed, a curve when the news is bad. */
const MOUTH = {
  closed: "M22 40 h20",
  sorry: "M22 43 q10 -8 20 0"
};

bridge.on(message => {
  if (message.kind !== "notice") return;

  const { notice, reward } = message;
  const tone = reward ? "reward" : notice?.tone ?? "warning";

  el.title.textContent = reward ?? notice?.title ?? "";
  el.text.textContent = reward ? "" : notice?.text ?? "";
  el.text.hidden = !el.text.textContent;

  el.card.classList.remove("is-warning", "is-paused", "is-reward");
  el.card.classList.add(`is-${tone === "lost" ? "paused" : tone}`);
  el.mouth.setAttribute("d", tone === "reward" ? MOUTH.closed : MOUTH.sorry);
});
