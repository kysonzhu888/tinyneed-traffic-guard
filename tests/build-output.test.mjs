import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verificationFilename = "google1089c0cca1aa4f0a.html";
const verificationSha256 = "1b3bb8d0def6cac39e4e253c488c12f52c240d5376afc80fda8a544e0c166ff1";
const analyticsBeaconURL = "https://static.cloudflareinsights.com/beacon.min.js";
const expectedAnalyticsTokenSha256 = "2532181ca69e70b7e1728989edbfb896946cf08705cb7bbbd6da4320444a165e";
const expectedLastModifiedByPathname = new Map([
  ["privacy/", "2026-07-16"],
  ["app-store/", "2026-07-14"],
]);

function findHtmlDocuments(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findHtmlDocuments(entryPath);
    if (!entry.name.endsWith(".html")) return [];

    const html = fs.readFileSync(entryPath, "utf8");
    return /^<!doctype html>/i.test(html.trimStart()) ? [{ entryPath, html }] : [];
  });
}

test("build preserves the Google Search Console verification file", () => {
  const build = spawnSync(process.execPath, ["tools/build.mjs"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(build.status, 0, build.stderr || build.stdout);

  const source = path.join(root, verificationFilename);
  const deployed = path.join(root, ".deploy", verificationFilename);
  assert.equal(fs.existsSync(source), true, `${verificationFilename} is missing from source`);
  assert.equal(fs.existsSync(deployed), true, `${verificationFilename} is missing from .deploy`);
  assert.equal(fs.readFileSync(deployed, "utf8"), fs.readFileSync(source, "utf8"));
  assert.equal(
    createHash("sha256").update(fs.readFileSync(source)).digest("hex"),
    verificationSha256,
    `${verificationFilename} content changed`,
  );
});

test("sitemap dates reflect the updated Privacy and App Store pages", () => {
  const build = spawnSync(process.execPath, ["tools/build.mjs"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(build.status, 0, build.stderr || build.stdout);

  const sitemap = fs.readFileSync(path.join(root, ".deploy", "sitemap.xml"), "utf8");

  for (const [pathname, expectedLastModified] of expectedLastModifiedByPathname) {
    const entry = sitemap.match(
      new RegExp(`<url>\\s*<loc>https://traffic-guard\\.tinyneed\\.com/${pathname}</loc>[\\s\\S]*?</url>`),
    );

    assert.ok(entry, `missing sitemap entry for ${pathname}`);
    assert.match(entry[0], new RegExp(`<lastmod>${expectedLastModified}</lastmod>`));
  }
});

test("build adds Cloudflare Web Analytics exactly once to every HTML document", () => {
  const build = spawnSync(process.execPath, ["tools/build.mjs"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(build.status, 0, build.stderr || build.stdout);

  const htmlDocuments = findHtmlDocuments(path.join(root, ".deploy"));
  assert.ok(htmlDocuments.length > 0, "build produced no HTML documents");

  for (const { entryPath, html } of htmlDocuments) {
    const relativePath = path.relative(path.join(root, ".deploy"), entryPath);
    assert.equal(
      html.split(analyticsBeaconURL).length - 1,
      1,
      `${relativePath} must contain exactly one analytics beacon`,
    );
    assert.equal(
      html.split("data-cf-beacon=").length - 1,
      1,
      `${relativePath} must contain exactly one analytics configuration`,
    );

    const configuration = html.match(/data-cf-beacon='([^']+)'/);
    assert.ok(configuration, `${relativePath} is missing its analytics configuration`);
    const { token } = JSON.parse(configuration[1]);
    assert.equal(
      createHash("sha256").update(token).digest("hex"),
      expectedAnalyticsTokenSha256,
      `${relativePath} must reuse the TinyNeed Cloudflare Web Analytics site tag`,
    );
  }
});
