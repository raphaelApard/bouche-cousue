/**
 * The only thing the renderers can touch outside their own document.
 *
 * Context isolation is on and Node integration is off, so the engine and the
 * panel are ordinary web pages; this hands them a small, named door to the
 * main process and nothing else. `lib/bridge.js` is what they import to reach
 * it — the counterpart of the extensions' `lib/api.js`.
 *
 * CommonJS, because a preload script is loaded before the module goes up.
 */

const { contextBridge, ipcRenderer } = require("electron");

/** Which window this is; passed in `additionalArguments` when it is created. */
const role = (process.argv.find(arg => arg.startsWith("--p4l-role=")) ?? "").split("=")[1] ?? "";

contextBridge.exposeInMainWorld("p4l", {
  role,

  /** Sends one message to the main process, which routes it. */
  send: message => ipcRenderer.send("p4l:message", message),

  /** Receives the messages the main process routes back. */
  on: handler => ipcRenderer.on("p4l:message", (_event, message) => handler(message)),

  readSettings: keys => ipcRenderer.invoke("p4l:read-settings", keys),
  writeSetting: (key, value) => ipcRenderer.invoke("p4l:write-setting", key, value)
});
