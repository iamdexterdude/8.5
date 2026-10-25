// Builds the static site.
//   node tools/build.mjs            -> dist/           public build: the plan's own content only
//   node tools/build.mjs --private  -> build-private/  adds course/eight-course-pack.json for local use (never published)
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const priv = process.argv.includes("--private");
const out = join(root, priv ? "build-private" : "dist");

// empty the folder instead of deleting it, so a local server running inside it does not block the build
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) rmSync(join(out, f), { recursive: true, force: true });
cpSync(join(root, "app"), out, { recursive: true, filter: (src) => !/course-pack\.json$/.test(src) });

if (priv) {
  const pack = join(root, "course", "eight-course-pack.json");
  if (!existsSync(pack)) { console.error("No course pack yet. Run tools/course-ingest/build_catalogue.py first."); process.exit(1); }
  cpSync(pack, join(out, "course-pack.json"));
  const idx = join(out, "index.html");
  writeFileSync(idx, readFileSync(idx, "utf8").replace("</head>", '  <meta name="eight-pack" content="course-pack.json">\n</head>'));
}

// preload the first screen's module chain, so a first visit over a slow connection fetches it in parallel instead of one level at a time
{
  const seen = new Set(), queue = ["js/main.js", "js/views/today.js", "js/srs.js", "js/views/welcome.js"];
  while (queue.length) {
    const f = queue.shift(); if (seen.has(f)) continue;
    const p = join(out, f); if (!existsSync(p)) continue;
    seen.add(f);
    const src = readFileSync(p, "utf8");
    for (const m of src.matchAll(/(?:^|\n)\s*import[^"'\n]*?from\s*["'](\.[^"']+)["']|(?:^|\n)\s*import\s*["'](\.[^"']+)["']/g)) {
      const rel = m[1] || m[2]; const dir = f.split("/").slice(0, -1).join("/");
      const parts = (dir ? dir + "/" : "").concat(rel).split("/"), outp = [];
      for (const s of parts) { if (s === "..") outp.pop(); else if (s !== ".") outp.push(s); }
      queue.push(outp.join("/"));
    }
  }
  const links = [...seen].map((f) => `  <link rel="modulepreload" href="${f}">`).concat(['  <link rel="preload" href="data/config.json" as="fetch" crossorigin="anonymous">', '  <link rel="preload" href="data/daily.json" as="fetch" crossorigin="anonymous">']);
  const idx = join(out, "index.html");
  writeFileSync(idx, readFileSync(idx, "utf8").replace("</head>", links.join("\n") + "\n</head>"));
}

// list every file for the service worker to cache, then stamp the version
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(relative(out, p).replaceAll("\\", "/")); } })(out);
const assets = ["./", ...files.filter((f) => f !== "sw.js" && f !== "course-pack.json")];
const version = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
const swPath = join(out, "sw.js");
writeFileSync(swPath, readFileSync(swPath, "utf8").replace('"__VERSION__"', JSON.stringify(version)).replace('"__ASSETS__"', JSON.stringify(assets)));
console.log(`${priv ? "private" : "public"} build: ${files.length} files, version ${version} -> ${relative(root, out)}`);
