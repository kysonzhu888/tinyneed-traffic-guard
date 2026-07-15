import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const home = await readFile(new URL("../index.html", import.meta.url), "utf8");
const availability = await readFile(new URL("../app-store/index.html", import.meta.url), "utf8");
const privacy = await readFile(new URL("../privacy/index.html", import.meta.url), "utf8");

for (const internalPhrase of ["Review notes", "Privacy label draft", "Submission checklist"]) {
  assert.doesNotMatch(availability, new RegExp(internalPhrase, "i"));
}

assert.match(home, /href="\/app-store\/">Check App Store availability<\/a>/);
assert.match(availability, /Traffic Guard is not yet available on the Mac App Store/);
assert.match(availability, /href="\/support\/">Contact support<\/a>/);

for (const eventName of [
  "premium_paywall_view",
  "premium_purchase_attempt",
  "premium_purchase_result",
  "premium_restore_attempt",
  "premium_restore_result",
]) {
  assert.match(privacy, new RegExp(eventName));
}

for (const page of [home, availability, privacy]) {
  assert.doesNotMatch(page, /configured release builds may use Firebase Analytics/i);
  assert.doesNotMatch(page, /may use Firebase Analytics/i);
  assert.match(page, /uses Firebase Analytics from app launch/i);
  assert.match(page, /transaction identifiers/i);
  assert.match(page, /prices/i);
  assert.match(page, /Apple Account details/i);
}

assert.match(privacy, /used only for product analysis/i);
assert.match(privacy, /purchase and restore flows/i);

assert.match(home, /href="\/privacy\/">Privacy Policy<\/a>/);
assert.match(availability, /href="\/privacy\/">Read the privacy policy<\/a>/);

console.log("public support-site copy tests passed");
