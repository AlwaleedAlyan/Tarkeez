// Normalize features/classifier/whitelist-source.txt into whitelist.json.
//
// Usage:  node scripts/normalize-whitelist.mjs
//
// Source format: one URL or domain per line. Blank lines and `#` comments
// are ignored. The script:
//   - strips http(s):// if present
//   - keeps only the hostname (drops path, query, fragment, port)
//   - strips leading www. / m. / mobile.
//   - lowercases
//   - dedupes
//   - sorts alphabetically
//
// Writes the result as a JSON array to features/classifier/whitelist.json.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(here, "..", "features/classifier/whitelist-source.txt");
const TARGET = path.resolve(here, "..", "features/classifier/whitelist.json");

const raw = fs.readFileSync(SOURCE, "utf8");
const seen = new Set();
const out = [];
let skipped = 0;

for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  let domain;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    domain = new URL(withScheme).hostname.toLowerCase();
  } catch {
    skipped++;
    continue;
  }
  domain = domain.replace(/^(www|m|mobile)\./, "");
  if (!domain || seen.has(domain)) continue;
  seen.add(domain);
  out.push(domain);
}

out.sort();
fs.writeFileSync(TARGET, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`Wrote ${out.length} domains to ${path.relative(process.cwd(), TARGET)}`);
if (skipped > 0) console.warn(`Skipped ${skipped} unparseable line(s)`);
