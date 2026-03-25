import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// Custom metrics
const errorRate = new Rate("errors");
const responseTime = new Trend("response_time");

// =============================================================
// DDoS Simulation: HTTP Flood via Proxy
// Target: local nginx container
// Proxy: local squid container
// =============================================================

export const options = {
  scenarios: {
    // Phase 1: Normal traffic (baseline)
    baseline: {
      executor: "constant-arrival-rate",
      rate: 10,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 10,
      startTime: "0s",
      tags: { phase: "baseline" },
    },

    // Phase 2: Ramp up (attack begins)
    ramp_up: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      stages: [
        { duration: "15s", target: 100 },
        { duration: "15s", target: 300 },
      ],
      preAllocatedVUs: 200,
      startTime: "30s",
      tags: { phase: "ramp_up" },
    },

    // Phase 3: Full flood
    flood: {
      executor: "constant-arrival-rate",
      rate: 500,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 300,
      startTime: "60s",
      tags: { phase: "flood" },
    },

    // Phase 4: Cool down
    cooldown: {
      executor: "ramping-arrival-rate",
      startRate: 500,
      timeUnit: "1s",
      stages: [
        { duration: "15s", target: 50 },
        { duration: "15s", target: 5 },
      ],
      preAllocatedVUs: 200,
      startTime: "90s",
      tags: { phase: "cooldown" },
    },
  },

  thresholds: {
    http_req_duration: ["p(95)<2000"], // Track when latency degrades
    errors: ["rate<0.5"],
  },
};

const TARGET_URL = __ENV.TARGET_URL || "http://target:80";
const PROXY_URL = __ENV.HTTP_PROXY || "http://proxy:3128";

const endpoints = ["/", "/api/data", "/health"];

export default function () {
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const url = `${TARGET_URL}${endpoint}`;

  // Send request through proxy
  const params = {
    headers: {
      "User-Agent": `k6-ddos-sim/${__VU}`,
      "X-Forwarded-For": `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    },
    timeout: "5s",
  };

  const res = http.get(url, params);

  // Track metrics
  responseTime.add(res.timings.duration);
  errorRate.add(res.status !== 200);

  check(res, {
    "status is 200": (r) => r.status === 200,
    "response time < 500ms": (r) => r.timings.duration < 500,
  });
}

export function handleSummary(data) {
  const summary = {
    total_requests: data.metrics.http_reqs.values.count,
    avg_response_time: data.metrics.http_req_duration.values.avg.toFixed(2) + "ms",
    p95_response_time: data.metrics.http_req_duration.values["p(95)"].toFixed(2) + "ms",
    max_response_time: data.metrics.http_req_duration.values.max.toFixed(2) + "ms",
    error_rate: (data.metrics.errors.values.rate * 100).toFixed(2) + "%",
    requests_per_second: data.metrics.http_reqs.values.rate.toFixed(2),
  };

  console.log("\n====== DDoS SIMULATION REPORT ======");
  console.log(`Total Requests:     ${summary.total_requests}`);
  console.log(`Avg Response Time:  ${summary.avg_response_time}`);
  console.log(`P95 Response Time:  ${summary.p95_response_time}`);
  console.log(`Max Response Time:  ${summary.max_response_time}`);
  console.log(`Error Rate:         ${summary.error_rate}`);
  console.log(`Requests/sec:       ${summary.requests_per_second}`);
  console.log("====================================\n");

  return {
    stdout: JSON.stringify(summary, null, 2),
    "/scripts/results/summary.json": JSON.stringify(data, null, 2),
  };
}
