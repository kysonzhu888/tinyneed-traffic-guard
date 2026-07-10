const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const byteUnits = ["B", "KB", "MB", "GB", "TB"];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function normalizeText(value, maxLength, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength);
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

const diagnosticFieldNames = [
  "currentWiFi",
  "isCounting",
  "trafficEngineTitle",
  "trafficEngineDetail",
  "monthlyUsedBytes",
  "monthlyExcludedLocalNetworkBytes",
  "monthlyCapBytes",
  "totalSpikeBytes",
  "totalSpikeWindowSeconds",
  "appSpikeBytes",
  "appSpikeWindowSeconds",
  "topApps"
];

function includesUsageDiagnostics(payload) {
  // Payloads from older app versions had no consent flag and always included diagnostics.
  return payload?.includesDiagnostics !== false;
}

function sanitizeFeedbackPayload(payload) {
  if (includesUsageDiagnostics(payload)) {
    return { ...payload, includesDiagnostics: true };
  }

  const sanitized = { ...payload, includesDiagnostics: false };
  for (const fieldName of diagnosticFieldNames) {
    delete sanitized[fieldName];
  }
  return sanitized;
}

function escapeSlack(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatBytes(bytes) {
  let value = normalizeNumber(bytes);
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < byteUnits.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  const digits = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${byteUnits[unitIndex]}`;
}

function topAppLines(rawApps) {
  if (!Array.isArray(rawApps)) return "_No app summary sent._";
  const lines = rawApps
    .slice(0, 8)
    .map((app) => {
      const name = normalizeText(app?.name, 80, "Unknown app");
      const month = formatBytes(app?.monthlyBytes);
      const today = formatBytes(app?.dailyBytes);
      return `• ${escapeSlack(name)}: ${month} this month, ${today} today`;
    });
  return lines.length ? lines.join("\n") : "_No app summary sent._";
}

async function parsePayload(request) {
  const raw = await request.text();
  if (raw.length > 12000) {
    return { error: json({ error: "Feedback payload is too large." }, 413) };
  }

  try {
    return { data: JSON.parse(raw) };
  } catch {
    return { error: json({ error: "Feedback must be valid JSON." }, 400) };
  }
}

function makeSlackPayload(payload, request) {
  const category = normalizeText(payload.category, 80, "Other");
  const message = normalizeText(payload.message, 2000);
  const email = normalizeText(payload.email, 120, "Not provided");
  const appVersion = normalizeText(payload.appVersion, 40, "unknown");
  const bundleIdentifier = normalizeText(payload.bundleIdentifier, 120, "unknown");
  const macOSVersion = normalizeText(payload.macOSVersion, 120, "unknown");
  const currentWiFi = normalizeText(payload.currentWiFi, 120, "unknown");
  const country = request.cf?.country || "unknown";
  const source = normalizeText(payload.source, 40, "unknown");
  const diagnosticsIncluded = includesUsageDiagnostics(payload);
  const counting = normalizeBoolean(payload.isCounting) ? "active" : "paused";

  const quotaLine = `${formatBytes(payload.monthlyUsedBytes)} / ${formatBytes(payload.monthlyCapBytes)}`;
  const totalSpikeLine = `${formatBytes(payload.totalSpikeBytes)} window`;
  const appSpikeLine = `${formatBytes(payload.appSpikeBytes)} window`;
  const topApps = topAppLines(payload.topApps);
  const now = new Date().toISOString();

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Traffic Guard feedback",
        emoji: false
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Category:* ${escapeSlack(category)}\n*Email:* ${escapeSlack(email)}\n*Message:*\n${escapeSlack(message)}`
      }
    }
  ];

  if (diagnosticsIncluded) {
    blocks.push(
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*App:*\n${escapeSlack(appVersion)} · ${escapeSlack(bundleIdentifier)}` },
          { type: "mrkdwn", text: `*macOS:*\n${escapeSlack(macOSVersion)}` },
          { type: "mrkdwn", text: `*Wi-Fi:*\n${escapeSlack(currentWiFi)} · ${counting}` },
          { type: "mrkdwn", text: `*Monthly usage:*\n${escapeSlack(quotaLine)}` },
          { type: "mrkdwn", text: `*Total alert:*\n${escapeSlack(totalSpikeLine)}` },
          { type: "mrkdwn", text: `*App alert:*\n${escapeSlack(appSpikeLine)}` }
        ]
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Top apps summary:*\n${topApps}`
        }
      }
    );
  } else {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*App:* ${escapeSlack(appVersion)} · *macOS:* ${escapeSlack(macOSVersion)}\n*Usage diagnostics:* Not shared by the user.`
      }
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Source: ${escapeSlack(source)} · Country: ${escapeSlack(country)} · ${now}`
      }
    ]
  });

  return {
    text: `New Traffic Guard feedback: ${category}`,
    blocks
  };
}

async function saveFeedback(env, payload, message, request, deliveryStatus) {
  const database = env.TRAFFIC_GUARD_FEEDBACK_DB;
  if (!database) return false;

  const diagnosticsIncluded = includesUsageDiagnostics(payload);
  const category = normalizeText(payload.category, 80, "Other");
  const email = normalizeText(payload.email, 120);
  const appVersion = normalizeText(payload.appVersion, 40, "unknown");
  const bundleIdentifier = normalizeText(payload.bundleIdentifier, 120, "unknown");
  const macOSVersion = normalizeText(payload.macOSVersion, 120, "unknown");
  const currentWiFi = diagnosticsIncluded
    ? normalizeText(payload.currentWiFi, 120, "unknown")
    : "not_shared";
  const source = normalizeText(payload.source, 40, "unknown");
  const country = request.cf?.country || "unknown";
  const userAgent = normalizeText(request.headers.get("User-Agent"), 240, "unknown");
  const topApps = JSON.stringify(
    diagnosticsIncluded && Array.isArray(payload.topApps) ? payload.topApps.slice(0, 8) : []
  );
  const rawPayload = JSON.stringify({
    ...payload,
    message,
    topApps: Array.isArray(payload.topApps) ? payload.topApps.slice(0, 8) : []
  });

  await database.prepare(`
    INSERT INTO feedback (
      created_at,
      delivery_status,
      source,
      category,
      message,
      email,
      app_version,
      bundle_identifier,
      macos_version,
      current_wifi,
      is_counting,
      includes_diagnostics,
      monthly_used_bytes,
      monthly_cap_bytes,
      top_apps_json,
      raw_payload_json,
      cf_country,
      user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    new Date().toISOString(),
    deliveryStatus,
    source,
    category,
    message,
    email || null,
    appVersion,
    bundleIdentifier,
    macOSVersion,
    currentWiFi,
    diagnosticsIncluded && normalizeBoolean(payload.isCounting) ? 1 : 0,
    diagnosticsIncluded ? 1 : 0,
    diagnosticsIncluded ? normalizeNumber(payload.monthlyUsedBytes) : 0,
    diagnosticsIncluded ? normalizeNumber(payload.monthlyCapBytes) : 0,
    topApps,
    rawPayload,
    country,
    userAgent
  ).run();

  return true;
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function onRequestGet() {
  return json({ ok: true, service: "traffic-guard-feedback" });
}

export async function onRequestPost({ request, env }) {
  const parsed = await parsePayload(request);
  if (parsed.error) return parsed.error;
  const payload = parsed.data;

  if (normalizeText(payload.website, 200)) {
    return json({ ok: true });
  }

  const message = normalizeText(payload.message, 2000);
  if (!message) {
    return json({ error: "Feedback message is required." }, 400);
  }
  const sanitizedPayload = sanitizeFeedbackPayload({ ...payload, message });

  const webhookURL = env.TRAFFIC_GUARD_SLACK_WEBHOOK_URL;
  if (webhookURL) {
    const slackResponse = await fetch(webhookURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeSlackPayload(sanitizedPayload, request))
    });

    if (slackResponse.ok) {
      return json({ ok: true, delivery: "slack" });
    }
  }

  try {
    if (await saveFeedback(env, sanitizedPayload, message, request, webhookURL ? "stored_after_slack_failure" : "stored")) {
      return json({ ok: true, delivery: "stored" });
    }
  } catch (error) {
    console.error("Traffic Guard feedback storage failed", error);
  }

  return json({ error: "Feedback is temporarily unavailable." }, 503);
}
