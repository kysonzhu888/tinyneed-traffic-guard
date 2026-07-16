import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const deploy = new URL("../.deploy/", import.meta.url);
const analyticsBeaconURL = "https://static.cloudflareinsights.com/beacon.min.js";
const analyticsSiteToken = "8766e0f1c5cf486f81c867118dce77c5";
const analyticsScript =
  `<script defer src="${analyticsBeaconURL}" data-cf-beacon='${JSON.stringify({ token: analyticsSiteToken })}'></script>`;

const include = [
  "404.html",
  "index.html",
  "styles.css",
  "robots.txt",
  "sitemap.xml",
  "ads.txt",
  "google1089c0cca1aa4f0a.html",
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

async function addAnalyticsBeacon(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryURL = new URL(entry.name, directory);

    if (entry.isDirectory()) {
      entryURL.pathname += "/";
      await addAnalyticsBeacon(entryURL);
      continue;
    }

    if (!entry.name.endsWith(".html")) continue;

    const html = await readFile(entryURL, "utf8");
    if (!/^<!doctype html>/i.test(html.trimStart())) continue;
    if (html.includes(analyticsBeaconURL)) {
      throw new Error(`Analytics beacon already exists in ${entryURL.pathname}`);
    }
    if (!html.includes("</body>")) {
      throw new Error(`Cannot add analytics beacon to ${entryURL.pathname}: missing </body>`);
    }

    await writeFile(entryURL, html.replace("</body>", `  ${analyticsScript}\n  </body>`));
  }
}

await addAnalyticsBeacon(deploy);

console.log("Built .deploy");
