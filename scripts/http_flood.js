import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("errors");
const responseTime = new Trend("response_time");

// =============================================================
// Aggressive HTTP Flood - High volume, fast ramp
// =============================================================

export const options = {
  scenarios: {
    // Massive concurrent users ramping fast
    flood: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "5s", target: 500 },
        { duration: "10s", target: 2000 },
        { duration: "30s", target: 5000 },
        { duration: "20s", target: 5000 },
        { duration: "10s", target: 0 },
      ],
    },
    // Constant high-rate requests in parallel
    burst: {
      executor: "constant-arrival-rate",
      rate: 5000,
      timeUnit: "1s",
      duration: "60s",
      preAllocatedVUs: 3000,
      maxVUs: 8000,
      startTime: "5s",
    },
  },

  // Disable default thresholds so k6 doesn't abort early
  thresholds: {
    http_req_failed: [{ threshold: "rate<1.0", abortOnFail: false }],
  },

  batch: 50,
  batchPerHost: 50,
  noConnectionReuse: true,    // Force new connections (more stress)
  discardResponseBodies: true, // Don't waste memory reading responses
};

const TARGET = __ENV.TARGET_URL || "http://target:80";
const paths = ["/", "/api/data", "/health", "/api/data?q=flood", "/api/data?page=1&size=100"];

export default function () {
  // Fire multiple requests per iteration
  const batch = paths.map((p) => ["GET", `${TARGET}${p}`, null, {
    headers: {
      "User-Agent": `flood/${__VU}-${__ITER}`,
      "X-Forwarded-For": `${randIP()}`,
      "Accept": "*/*",
      "Connection": "close",
    },
    timeout: "3s",
  }]);

  const responses = http.batch(batch);

  for (const res of responses) {
    responseTime.add(res.timings.duration);
    errorRate.add(res.status !== 200);
  }
}

function randIP() {
  return `${rand(1,223)}.${rand(0,255)}.${rand(0,255)}.${rand(1,254)}`;
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function handleSummary(data) {
  const m = data.metrics;
  console.log("\n========== HTTP FLOOD REPORT ==========");
  console.log(`Total Requests:     ${m.http_reqs.values.count}`);
  console.log(`Requests/sec:       ${m.http_reqs.values.rate.toFixed(0)}`);
  console.log(`Avg Response:       ${m.http_req_duration.values.avg.toFixed(1)}ms`);
  console.log(`P95 Response:       ${m.http_req_duration.values["p(95)"].toFixed(1)}ms`);
  console.log(`Max Response:       ${m.http_req_duration.values.max.toFixed(1)}ms`);
  console.log(`Failed Requests:    ${(m.http_req_failed.values.rate * 100).toFixed(1)}%`);
  console.log(`Error Rate:         ${(m.errors.values.rate * 100).toFixed(1)}%`);
  console.log("========================================\n");
  return { stdout: JSON.stringify(m, null, 2) };
}
