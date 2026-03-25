import http from "k6/http";
import { sleep } from "k6";
import { Rate } from "k6/metrics";

// =============================================================
// DDoS Simulation: Slowloris Attack
// Keeps connections open as long as possible to exhaust server
// =============================================================

const errorRate = new Rate("errors");

export const options = {
  scenarios: {
    slowloris: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 50 },
        { duration: "20s", target: 200 },
        { duration: "30s", target: 500 },  // Try to exhaust connections
        { duration: "20s", target: 500 },  // Hold
        { duration: "10s", target: 0 },    // Release
      ],
    },
  },
};

const TARGET_URL = __ENV.TARGET_URL || "http://target:80";

export default function () {
  // Slowloris: send partial headers slowly to keep connection alive
  const res = http.get(`${TARGET_URL}/`, {
    headers: {
      "User-Agent": `slowloris-sim/${__VU}`,
      // Send many custom headers to slow processing
      "X-Custom-1": "A".repeat(100),
      "X-Custom-2": "B".repeat(100),
      "X-Custom-3": "C".repeat(100),
      "X-Custom-4": "D".repeat(100),
      "X-Custom-5": "E".repeat(100),
    },
    timeout: "30s",
  });

  errorRate.add(res.status !== 200);

  // Keep connection alive as long as possible
  sleep(Math.random() * 5 + 2);
}

export function handleSummary(data) {
  console.log("\n====== SLOWLORIS SIMULATION REPORT ======");
  console.log(`Total Requests:  ${data.metrics.http_reqs.values.count}`);
  console.log(`Error Rate:      ${(data.metrics.errors.values.rate * 100).toFixed(2)}%`);
  console.log(`Avg Duration:    ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms`);
  console.log(`Max Duration:    ${data.metrics.http_req_duration.values.max.toFixed(2)}ms`);
  console.log("==========================================\n");

  return {
    stdout: JSON.stringify(data.metrics, null, 2),
  };
}
