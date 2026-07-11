import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const deploy = new URL("../.deploy/", import.meta.url);

const include = [
  "404.html",
  "index.html",
  "styles.css",
  "robots.txt",
  "sitemap.xml",
  "ads.txt",
  "privacy",
  "terms",
  "support",
  "app-store",
  "functions",
  "assets"
];

await rm(deploy, { recursive: true, force: true });
await mkdir(deploy, { recursive: true });

for (const item of include) {
  const from = new URL(item, root);
  if (!existsSync(from)) continue;
  const to = new URL(item, deploy);
  await cp(from, to, { recursive: true });
}

console.log("Built .deploy");
