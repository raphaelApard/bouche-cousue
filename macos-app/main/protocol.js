/**
 * Serving the app's own pages over `app://` instead of `file://`.
 *
 * Three things need this. ES modules are refused over `file://` — the whole
 * `lib/` graph would fail to load. `fetch` is refused too, which is how the
 * locale is read. And `getUserMedia` wants a secure context, which a custom
 * scheme can declare itself to be and `file://` cannot.
 *
 * The result is that the renderers see the same shape of world as the
 * extensions do under `moz-extension://`: one origin, absolute paths from its
 * root, relative imports between modules.
 */

import path from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";

import { ORIGIN } from "../lib/config.js";

const SCHEME = new URL(`${ORIGIN}/`).protocol.replace(":", "");

/**
 * What these pages are allowed to load: their own files, the camera, and the
 * WebAssembly the models run on. Nothing reaches the network, which is both
 * the privacy promise and the reason the runtime is vendored.
 */
const POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: data:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "style-src 'self'",
  "object-src 'none'"
].join("; ");

/** Must run before the app is ready; Electron will not take it afterwards. */
export function registerScheme() {
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }]);
}

/**
 * Maps the scheme onto one directory, and nothing above it.
 *
 * @param {string} root  the app folder; every request is resolved inside it.
 */
export function serve(root) {
  protocol.handle(SCHEME, request => {
    const { pathname } = new URL(request.url);
    const file = path.join(root, decodeURIComponent(pathname));

    // `path.join` collapses `..`, so this is what stops a crafted URL reading
    // the rest of the disk.
    if (file !== root && !file.startsWith(root + path.sep)) {
      return new Response("Forbidden", { status: 403 });
    }
    return net.fetch(pathToFileURL(file).toString()).then(response => {
      const headers = new Headers(response.headers);
      headers.set("Content-Security-Policy", POLICY);
      return new Response(response.body, { status: response.status, headers });
    });
  });
}

/** @param {string} page  e.g. `engine/engine.html` */
export function pageURL(page) {
  return `${ORIGIN}/${page}`;
}
