/**
 * The cartoon catalogue: a grid of series, then the episodes of one.
 *
 * This module only draws. Which screen is showing, the browser history and
 * what happens on a click all belong to `source-picker.js`, which hands its
 * handlers to `initCatalog()` and calls `showSeriesList()` / `showEpisodes()`.
 * The one click handled here is turning a page of episodes: it changes what
 * is drawn, not where the app is, so it pushes no history entry.
 *
 * The lists come from `catalog/<locale>.json`, generated from the official
 * channels by `scripts/fetch-catalog.mjs`. Every title in them is foreign text,
 * so the DOM is built with `createElement` and `textContent` — never
 * `innerHTML`. The view is remembered as data rather than as markup, so a
 * language switch redraws it from the other locale's file, and coming back
 * from a film redraws it with the counters that film just changed.
 */

import { el } from "./dom.js";
import { CATALOG } from "./config.js";
import { getLocale, onLocaleChange, t } from "./i18n.js";
import { getEntry } from "./watch-history.js";

/** Resolved against this module, like the locales, so any base path works. */
const CATALOG_URL = new URL(`../${CATALOG.PATH}/`, import.meta.url);

/** @type {Map<string, Promise<object>>} locale to its (pending) catalogue. */
const loaded = new Map();

/** @type {{kind: "series"} | {kind: "episodes", seriesId: string} | null} */
let view = null;

/** Bumped on every render, so a slow fetch cannot paint over a newer view. */
let renderToken = 0;

/**
 * Where the list was scrolled when a film was opened from it, so the child
 * comes back to the episode they just watched rather than to the top.
 * @type {{key: string, top: number} | null}
 */
let remembered = null;

let handlers = { onPickSeries() {}, onPickEpisode() {}, onBack() {} };

/** The page shown for each series, so coming back lands on the same one. */
const pages = new Map();

/**
 * The episode last opened from the list. Coming back to its series shows its
 * page and scrolls to it — after episodes played back to back, that may be a
 * long way from where the list was left.
 * @type {{seriesId: string, videoId: string} | null}
 */
let lastPlayed = null;

function load(code) {
  if (!loaded.has(code)) {
    const request = fetch(new URL(`${code}.json`, CATALOG_URL))
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
    // A failed fetch is not cached: the next visit to the screen tries again.
    request.catch(() => loaded.delete(code));
    loaded.set(code, request);
  }
  return loaded.get(code);
}

/* ---------- Small builders ---------- */

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Decorative: the title next to it already says what it shows. */
function thumbnail(videoId) {
  const image = node("img", "catalog__thumb");
  image.src = CATALOG.THUMBNAIL.replace("{id}", encodeURIComponent(videoId));
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.width = 320;
  image.height = 180;
  return image;
}

function formatMinutes(seconds) {
  return new Intl.NumberFormat(getLocale(), { style: "unit", unit: "minute" })
    .format(Math.max(1, Math.round(seconds / 60)));
}

/**
 * What the badge says about one episode: nothing for a new one, "started"
 * for one closed before its end, and how many times it was seen otherwise.
 */
function progressOf(videoId) {
  const { views, started } = getEntry(videoId);
  if (views === 1) return { state: "seen", label: t("catalog.seenOnce") };
  if (views > 1) return { state: "seen", label: t("catalog.seenTimes", { count: String(views) }) };
  if (started) return { state: "started", label: t("catalog.started") };
  return { state: "new", label: "" };
}

/* ---------- Screens ---------- */

function showOnly(list, message) {
  el.catalogSeries.hidden = list !== el.catalogSeries;
  el.catalogEpisodes.hidden = list !== el.catalogEpisodes;
  el.catalogMessage.hidden = !message;
  el.catalogMessage.textContent = message ?? "";
  el.catalogPager.hidden = true;
}

function renderSeries(data) {
  el.catalogTitle.textContent = t("catalog.title");
  el.catalogChannel.hidden = true;

  if (data.series.length === 0) {
    el.catalogSeries.replaceChildren();
    showOnly(null, t("catalog.empty"));
    return;
  }

  const cards = data.series.map(series => {
    const button = node("button", "catalog-card catalog-card--series");
    button.type = "button";
    button.append(
      thumbnail(series.episodes[0].id),
      node("span", "catalog-card__name", series.name),
      node("span", "catalog-card__meta",
        t("catalog.episodeCount", { count: String(series.episodes.length) }))
    );
    button.addEventListener("click", () => handlers.onPickSeries(series.id));

    const item = node("li");
    item.append(button);
    return item;
  });

  el.catalogSeries.replaceChildren(...cards);
  showOnly(el.catalogSeries);
}

function pageCountOf(series) {
  return Math.max(1, Math.ceil(series.episodes.length / CATALOG.PAGE_SIZE));
}

function renderEpisodes(series) {
  el.catalogTitle.textContent = series.name;
  el.catalogChannel.textContent = t("catalog.channel", { channel: series.channelTitle });
  el.catalogChannel.hidden = false;

  const pageCount = pageCountOf(series);
  const page = Math.min(pages.get(series.id) ?? 0, pageCount - 1);
  const first = page * CATALOG.PAGE_SIZE;
  const shown = series.episodes.slice(first, first + CATALOG.PAGE_SIZE);

  const cards = shown.map(episode => {
    const progress = progressOf(episode.id);

    const button = node("button", `catalog-card catalog-card--episode is-${progress.state}`);
    button.type = "button";
    button.dataset.videoId = episode.id;

    const picture = node("span", "catalog-card__picture");
    picture.append(thumbnail(episode.id));
    if (progress.state === "seen") picture.append(node("span", "catalog-card__check", "✓"));

    const meta = node("span", "catalog-card__meta", formatMinutes(episode.duration));
    if (progress.label) meta.append(node("span", "catalog-card__badge", progress.label));

    button.append(picture, node("span", "catalog-card__name", episode.title), meta);
    button.addEventListener("click", () => handlers.onPickEpisode(series.id, episode.id));

    const item = node("li");
    item.append(button);
    return item;
  });

  el.catalogEpisodes.replaceChildren(...cards);
  showOnly(el.catalogEpisodes);

  el.catalogPager.hidden = pageCount < 2;
  el.catalogPageLabel.textContent =
    t("catalog.page", { page: String(page + 1), pages: String(pageCount) });
  el.catalogPrevPage.disabled = page === 0;
  el.catalogNextPage.disabled = page === pageCount - 1;
}

async function render() {
  if (!view) return;
  const token = ++renderToken;

  if (!loaded.has(getLocale())) {
    el.catalogTitle.textContent = t("catalog.title");
    el.catalogChannel.hidden = true;
    showOnly(null, t("catalog.loading"));
  }

  let data;
  try {
    data = await load(getLocale());
  } catch (error) {
    console.error(error);
    if (token === renderToken) showOnly(null, t("catalog.loadFailed"));
    return;
  }
  if (token !== renderToken || !view) return;

  if (view.kind === "episodes") {
    const { seriesId } = view;
    const series = data.series.find(entry => entry.id === seriesId);
    // A series missing from this language's catalogue falls back to the grid.
    if (series) {
      renderEpisodes(series);
      return;
    }
  }
  renderSeries(data);
}

/* ---------- Public ---------- */

function keyOf(target) {
  return target.kind === "episodes" ? `episodes:${target.seriesId}` : "series";
}

/** Puts the page holding the last episode played in front, if it is in this series. */
async function turnToLastPlayed(seriesId) {
  if (lastPlayed?.seriesId !== seriesId) return;
  const data = await load(getLocale()).catch(() => null);
  const index = data?.series.find(entry => entry.id === seriesId)
    ?.episodes.findIndex(episode => episode.id === lastPlayed.videoId) ?? -1;
  if (index >= 0) pages.set(seriesId, Math.floor(index / CATALOG.PAGE_SIZE));
}

function lastPlayedCard() {
  if (!lastPlayed) return null;
  return [...el.catalogEpisodes.children]
    .map(item => item.firstElementChild)
    .find(button => button?.dataset.videoId === lastPlayed.videoId) ?? null;
}

async function enter(next) {
  const top = remembered?.key === keyOf(next) ? remembered.top : 0;
  remembered = null;
  view = next;
  if (next.kind === "episodes") await turnToLastPlayed(next.seriesId);
  el.catalog.scrollTop = 0;
  await render();

  const card = next.kind === "episodes" ? lastPlayedCard() : null;
  if (card) card.scrollIntoView({ block: "center" });
  else el.catalog.scrollTop = top;
}

async function turnPage(step) {
  if (view?.kind !== "episodes") return;
  const { seriesId } = view;
  pages.set(seriesId, Math.max(0, (pages.get(seriesId) ?? 0) + step));
  await render();
  el.catalog.scrollTop = 0;
}

export function showSeriesList() {
  return enter({ kind: "series" });
}

export function showEpisodes(seriesId) {
  return enter({ kind: "episodes", seriesId });
}

/** An episode was opened from the list. */
export function markPlayed(seriesId, videoId) {
  lastPlayed = { seriesId, videoId };
}

/**
 * Called when a film covers the catalogue. Remembers the scroll, and forgets
 * the view so a language switch does not redraw a screen nobody sees.
 */
export function hideCatalog() {
  if (view) remembered = { key: keyOf(view), top: el.catalog.scrollTop };
  view = null;
  renderToken += 1;
}

/**
 * @param {{
 *   onPickSeries: (seriesId: string) => void,
 *   onPickEpisode: (seriesId: string, videoId: string) => void,
 *   onBack: () => void
 * }} given
 */
export function initCatalog(given) {
  handlers = given;
  el.catalogBackButton.addEventListener("click", () => handlers.onBack());
  el.catalogPrevPage.addEventListener("click", () => turnPage(-1));
  el.catalogNextPage.addEventListener("click", () => turnPage(1));
  onLocaleChange(() => {
    if (view) render();
  });
}
