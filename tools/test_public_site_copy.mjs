import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const home = await readFile(new URL("../index.html", import.meta.url), "utf8");
const availability = await readFile(new URL("../app-store/index.html", import.meta.url), "utf8");

for (const internalPhrase of ["Review notes", "Privacy label draft", "Submission checklist"]) {
  assert.doesNotMatch(availability, new RegExp(internalPhrase, "i"));
}

assert.match(home, /href="\/app-store\/">Check App Store availability<\/a>/);
assert.match(availability, /Traffic Guard is not yet available on the Mac App Store/);
assert.match(availability, /href="\/support\/">Contact support<\/a>/);

console.log("public support-site copy tests passed");
