#!/usr/bin/env node
/**
 * Stage the web app into dist/, then run the static checks.
 *
 * There is nothing to compile here: the app ships the sources it runs. What
 * this does is *select*. The repository holds three front ends, and only one of
 * them is the site — the two extensions must never reach a web root. Copying a
 * known list into dist/ makes that selection explicit, and gives the deploy
 * script a directory it can mirror with --delete.
 *
 * It depends on nothing. `pnpm install` has no work to do, which is what keeps
 * the promise the READMEs make: clone it, serve it, it runs.
 *
 * The checks are the three from CLAUDE.md, the ones that replace a test suite:
 * every byId() resolves, every named import exists and the graph is acyclic,
 * and every translation key exists in both locale files. They run on dist/,
 * not on the sources, so what is verified is what would ship.
 *
 *   node scripts/build.mjs              build, then check dist/
 *   node scripts/build.mjs --check-only check the working tree, build nothing
 */

import { cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = path.join(ROOT, "dist");

/** The site, file by file. Everything else belongs to another front end. */
const SITE_FILES = ["index.html", "favicon.svg", "favicon-32.png", "favicon-180.png"];
const SITE_DIRS = ["css", "js", "locales"];

const checkOnly = process.argv.includes("--check-only");

const problems = [];
const fail = (message) => problems.push(message);
/**
 * Run one check and report it on its own line. What it found is printed under
 * it rather than in a heap at the end, so a failure names the check it came
 * from without anyone having to match them up.
 */
async function run(label, check) {
  const before = problems.length;
  const summary = await check();
  const found = problems.slice(before);
  if (found.length === 0) {
    console.log(`  ✓ ${label.padEnd(9)} ${summary}`);
    return;
  }
  console.log(`  ✗ ${label.padEnd(9)} ${found.length} problem(s)`);
  for (const problem of found) console.log(`      ${problem}`);
}

// --- Build ------------------------------------------------------------------

async function build() {
  // Cleared rather than overwritten: a file dropped from the repository must
  // not survive in dist/ and be mirrored back onto the server forever.
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  for (const name of SITE_FILES) {
    await cp(path.join(ROOT, name), path.join(DIST, name));
  }
  for (const name of SITE_DIRS) {
    await cp(path.join(ROOT, name), path.join(DIST, name), {
      recursive: true,
      filter: (src) => path.basename(src) !== ".DS_Store",
    });
  }

  let files = 0;
  let bytes = 0;
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        files += 1;
        bytes += (await stat(full)).size;
      }
    }
  };
  await walk(DIST);
  console.log(`  ${files} files, ${Math.round(bytes / 1024)} KB`);
}

// --- Checks -----------------------------------------------------------------

/**
 * Every local src/href in index.html has to exist. A stylesheet renamed in the
 * repository but not in the markup is a blank page in production, and rsync
 * has no opinion about it. Anything containing a colon is a URL — the fonts
 * and the MediaPipe CDN — and is not ours to verify.
 */
async function checkAssets(base, html) {
  let checked = 0;
  for (const [, ref] of html.matchAll(/(?:src|href)="([^":#]+)"/g)) {
    checked += 1;
    if (!existsSync(path.join(base, ref))) {
      fail(`index.html references ${ref}, which is not in the build`);
    }
  }
  return `${checked} local src/href in index.html resolve`;
}

/**
 * dom.js throws on a missing element, which is the right behaviour at runtime
 * and a blank screen for the child. Catching it here costs one regex.
 */
async function checkDom(base, html) {
  const source = await readFile(path.join(base, "js/dom.js"), "utf8");
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id));
  const wanted = [...source.matchAll(/byId\(\s*["']([^"']+)["']/g)].map(([, id]) => id);
  for (const id of wanted) {
    if (!ids.has(id)) fail(`js/dom.js asks for #${id}, which index.html does not define`);
  }
  return `${wanted.length} byId() lookups match an id in index.html`;
}

/** Named exports of one module, by source. Enough for the shapes used here. */
function exportsOf(source) {
  const names = new Set();
  for (const [, name] of source.matchAll(
    /^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    names.add(name);
  }
  // export { a, b as c }
  for (const [, list] of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of list.split(",")) {
      const alias = part.trim().split(/\s+as\s+/).pop();
      if (alias) names.add(alias.trim());
    }
  }
  return names;
}

/**
 * Every named import must exist in the module it comes from, and the graph
 * must stay acyclic — the layering in CLAUDE.md is the design, and a cycle
 * silently hands a module a half-initialised neighbour.
 *
 * Only relative specifiers are followed. The MediaPipe import in detector.js
 * is a CDN URL and cannot be resolved offline, which is as it should be.
 */
async function checkModules(base) {
  const dir = path.join(base, "js");
  const files = (await readdir(dir)).filter((name) => name.endsWith(".js"));
  const sources = new Map();
  for (const name of files) sources.set(name, await readFile(path.join(dir, name), "utf8"));

  const graph = new Map();
  let edges = 0;

  for (const [name, source] of sources) {
    const targets = [];
    // [^}]* spans newlines, so a multi-line import list is one match.
    for (const [, list, specifier] of source.matchAll(
      /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g,
    )) {
      if (!specifier.startsWith(".")) continue;
      const target = path.basename(specifier);
      if (!sources.has(target)) {
        fail(`js/${name} imports from ${specifier}, which does not exist`);
        continue;
      }
      targets.push(target);
      edges += 1;
      const available = exportsOf(sources.get(target));
      for (const part of list.split(",")) {
        const imported = part.trim().split(/\s+as\s+/)[0].trim();
        if (imported && !available.has(imported)) {
          fail(`js/${name} imports { ${imported} } from ${specifier}, which does not export it`);
        }
      }
    }
    graph.set(name, targets);
  }

  const state = new Map();
  const visit = (name, trail) => {
    if (state.get(name) === "done") return;
    if (state.get(name) === "open") {
      fail(`the module graph has a cycle: ${[...trail, name].join(" → ")}`);
      return;
    }
    state.set(name, "open");
    for (const target of graph.get(name) ?? []) visit(target, [...trail, name]);
    state.set(name, "done");
  };
  for (const name of graph.keys()) visit(name, []);

  return `${files.length} modules, ${edges} imports, acyclic`;
}

/** Every leaf of a nested locale object, as "a.b.c". */
function flatten(node, prefix = "") {
  const keys = new Set();
  for (const [key, value] of Object.entries(node)) {
    const full = prefix + key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const nested of flatten(value, `${full}.`)) keys.add(nested);
    } else {
      keys.add(full);
    }
  }
  return keys;
}

/**
 * The app is bilingual one language at a time, and both files are loaded at
 * startup — so a key present in one and not the other prints its own name at
 * the child, in whichever language nobody tested.
 *
 * Keys built from a variable, such as t(`cause.${...}`), cannot be resolved
 * here and are not looked for; the REASON values they are made of are the
 * reason CLAUDE.md asks for that renaming to be done in three places at once.
 */
async function checkLocales(base, html) {
  const locales = {};
  for (const code of ["fr", "en"]) {
    locales[code] = flatten(
      JSON.parse(await readFile(path.join(base, `locales/${code}.json`), "utf8")),
    );
  }
  for (const [here, there] of [["fr", "en"], ["en", "fr"]]) {
    for (const key of [...locales[here]].sort()) {
      if (!locales[there].has(key)) {
        fail(`${key} is in locales/${here}.json but not in locales/${there}.json`);
      }
    }
  }

  const used = new Set();
  for (const [, key] of html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) used.add(key);
  for (const name of await readdir(path.join(base, "js"))) {
    if (!name.endsWith(".js")) continue;
    const source = await readFile(path.join(base, "js", name), "utf8");
    // Not preceded by an identifier character or a dot, so getContext("2d")
    // and querySelectorAll("…") do not read as calls to t().
    for (const [, key] of source.matchAll(/(?<![\w$.])t\(\s*["']([^"']+)["']/g)) used.add(key);
  }
  for (const key of [...used].sort()) {
    for (const code of ["fr", "en"]) {
      if (!locales[code].has(key)) fail(`t("${key}") has no entry in locales/${code}.json`);
    }
  }

  return `${locales.fr.size} keys in both files, ${used.size} referenced`;
}

// --- Run --------------------------------------------------------------------

if (checkOnly) {
  console.log("Checking the working tree");
} else {
  console.log("Building dist/");
  await build();
  console.log("Checking the build");
}

const base = checkOnly ? ROOT : DIST;
const html = await readFile(path.join(base, "index.html"), "utf8");

await run("assets", () => checkAssets(base, html));
await run("dom", () => checkDom(base, html));
await run("modules", () => checkModules(base));
await run("locales", () => checkLocales(base, html));

if (problems.length) {
  // A build that failed its checks is the one thing rsync must never find
  // sitting there, so it does not get to survive the run that made it.
  if (!checkOnly) await rm(DIST, { recursive: true, force: true });
  console.error(
    `\n${problems.length} problem(s)${checkOnly ? "" : " — dist/ was removed"}.`,
  );
  process.exit(1);
}
