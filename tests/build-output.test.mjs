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
const expectedLastModified = "2026-07-14";

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

  for (const pathname of ["privacy/", "app-store/"]) {
    const entry = sitemap.match(
      new RegExp(`<url>\\s*<loc>https://traffic-guard\\.tinyneed\\.com/${pathname}</loc>[\\s\\S]*?</url>`),
    );

    assert.ok(entry, `missing sitemap entry for ${pathname}`);
    assert.match(entry[0], new RegExp(`<lastmod>${expectedLastModified}</lastmod>`));
  }
});
