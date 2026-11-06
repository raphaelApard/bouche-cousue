/**
 * The adult's agreement to load YouTube.
 *
 * A YouTube embed hands the visitor's address to Google and lets it set its
 * own trackers, which under the CNIL's reading of the ePrivacy rules needs
 * consent before anything is requested — not after. So nothing YouTube-shaped
 * (player, API script, thumbnail) is fetched until `askYoutubeConsent()` has
 * resolved to true.
 *
 * The answer is remembered as the date it was given, read back through
 * `readNumberInRange()` with a window of `CONSENT.MAX_AGE`: a missing, expired
 * or tampered value all read as "not asked yet", which is the safe reading.
 * A refusal is not stored — declining simply leaves the question to be asked
 * again the next time someone reaches for YouTube.
 */

import { el } from "./dom.js";
import { CONSENT, STORAGE_KEYS } from "./config.js";
import { readNumberInRange, removeRaw, writeRaw } from "./storage.js";

/** @type {Promise<boolean>|null} the question currently on screen, if any. */
let pending = null;

export function hasYoutubeConsent() {
  const now = Date.now();
  const givenAt = readNumberInRange(STORAGE_KEYS.youtubeConsent, {
    min: now - CONSENT.MAX_AGE,
    max: now
  });
  return givenAt !== null;
}

/** The withdraw button only makes sense while there is something to withdraw. */
function refreshRevokeButton() {
  el.revokeConsentButton.hidden = !hasYoutubeConsent();
}

/**
 * Resolves to true once YouTube may be loaded: at once when the agreement is
 * already on record, otherwise after the adult has answered the dialog.
 * Escape, or closing the dialog any other way, counts as a refusal.
 *
 * @returns {Promise<boolean>}
 */
export function askYoutubeConsent() {
  if (hasYoutubeConsent()) return Promise.resolve(true);
  if (pending) return pending;

  pending = new Promise(resolve => {
    el.consentDialog.addEventListener("close", () => {
      const accepted = el.consentDialog.returnValue === "accept";
      if (accepted) writeRaw(STORAGE_KEYS.youtubeConsent, Date.now());
      refreshRevokeButton();
      pending = null;
      resolve(accepted);
    }, { once: true });
  });

  el.consentDialog.returnValue = "";
  el.consentDialog.showModal();
  return pending;
}

/** Forgets the agreement; the next YouTube request asks again. */
export function revokeYoutubeConsent() {
  removeRaw(STORAGE_KEYS.youtubeConsent);
  refreshRevokeButton();
}

export function initConsent() {
  refreshRevokeButton();
}
