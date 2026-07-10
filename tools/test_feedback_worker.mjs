import assert from "node:assert/strict";

import { onRequestPost } from "../functions/api/feedback.js";

const basePayload = {
  source: "worker-test",
  category: "Bug report",
  message: "The counter looks wrong.",
  email: "test@example.com",
  appVersion: "1.0",
  bundleIdentifier: "com.uchuu.trafficguard",
  macOSVersion: "Version 26.0"
};

const diagnosticPayload = {
  currentWiFi: "Secret Wi-Fi",
  isCounting: true,
  trafficEngineTitle: "Advanced",
  trafficEngineDetail: "Private engine detail",
  monthlyUsedBytes: 5000,
  monthlyExcludedLocalNetworkBytes: 100,
  monthlyCapBytes: 10000,
  totalSpikeBytes: 1000,
  totalSpikeWindowSeconds: 300,
  appSpikeBytes: 500,
  appSpikeWindowSeconds: 300,
  topApps: [{ name: "Sensitive App", dailyBytes: 100, weeklyBytes: 200, monthlyBytes: 300 }]
};

function requestFor(payload) {
  return new Request("https://traffic-guard.test/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "TrafficGuardWorkerTest/1.0"
    },
    body: JSON.stringify(payload)
  });
}

async function slackBodyFor(payload) {
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response("ok", { status: 200 });
  };
  const response = await onRequestPost({
    request: requestFor(payload),
    env: { TRAFFIC_GUARD_SLACK_WEBHOOK_URL: "https://hooks.example.test/feedback" }
  });
  assert.equal(response.status, 200);
  return requestBody;
}

function databaseRecorder() {
  let values;
  return {
    database: {
      prepare() {
        return {
          bind(...boundValues) {
            values = boundValues;
            return { run: async () => ({ success: true }) };
          }
        };
      }
    },
    values: () => values
  };
}

const optOutSlack = await slackBodyFor({
  ...basePayload,
  ...diagnosticPayload,
  includesDiagnostics: false
});
const optOutSlackText = JSON.stringify(optOutSlack.blocks);
assert.match(optOutSlackText, /Not shared by the user/);
assert.doesNotMatch(optOutSlackText, /Secret Wi-Fi|Sensitive App|Monthly usage/);

const optInSlack = await slackBodyFor({
  ...basePayload,
  ...diagnosticPayload,
  includesDiagnostics: true
});
const optInSlackText = JSON.stringify(optInSlack.blocks);
assert.match(optInSlackText, /Secret Wi-Fi/);
assert.match(optInSlackText, /Sensitive App/);
assert.match(optInSlackText, /Monthly usage/);

const legacySlack = await slackBodyFor({ ...basePayload, ...diagnosticPayload });
assert.match(JSON.stringify(legacySlack.blocks), /Secret Wi-Fi/);

const recorder = databaseRecorder();
const storedResponse = await onRequestPost({
  request: requestFor({
    ...basePayload,
    ...diagnosticPayload,
    includesDiagnostics: false
  }),
  env: { TRAFFIC_GUARD_FEEDBACK_DB: recorder.database }
});
assert.equal(storedResponse.status, 200);
const storedValues = recorder.values();
assert.equal(storedValues[9], "not_shared");
assert.equal(storedValues[10], 0);
assert.equal(storedValues[11], 0);
assert.equal(storedValues[12], 0);
assert.equal(storedValues[13], 0);
assert.equal(storedValues[14], "[]");
assert.doesNotMatch(storedValues[15], /Secret Wi-Fi|Sensitive App|Private engine detail/);
assert.match(storedValues[15], /"includesDiagnostics":false/);

console.log("feedback worker consent tests passed");
