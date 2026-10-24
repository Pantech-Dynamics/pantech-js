// Copies the public API spec into spec/ so `npm run generate` can use it.
//   npm run spec:sync                 the published spec
//   npm run spec:sync -- <path|url>   a local file or another URL
import { readFileSync, writeFileSync } from "node:fs";

const PUBLISHED = "https://docs.pantechdynamics.com/openapi/public-api.yaml";
const DEST = "spec/public-api.yaml";
const source = process.argv[2] ?? PUBLISHED;

let text;
if (/^https?:\/\//.test(source)) {
  const res = await fetch(source);
  if (!res.ok) throw new Error(`Fetching ${source} failed: ${res.status}`);
  text = await res.text();
} else {
  text = readFileSync(source, "utf8");
}
writeFileSync(DEST, text);
console.log(`${DEST} updated from ${source}`);
