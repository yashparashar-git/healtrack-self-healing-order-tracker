// End-to-end smoke test against a running API (default http://127.0.0.1:5000).
// Creates one test order, so it needs MongoDB and internet access for OSRM.
//   npm run test:smoke                 core checks + DB, invalid-data and tracking scenarios
//   npm run test:smoke -- --osrm       also runs the OSRM outage scenario (~15s)
//   npm run test:smoke -- --negative   also checks that exhausted retries end FAILED
//                                      (adds one FAILED incident to the metrics)
const BASE = process.env.API_URL || "http://127.0.0.1:5000";
const withOsrm = process.argv.includes("--osrm");
const withNegative = process.argv.includes("--negative");

const results = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function runScenario(scenario, orderId, params, timeoutMs) {
  const started = await call("POST", "/api/chaos/runs", { scenario, orderId, params });
  if (started.status !== 202) return { status: `HTTP ${started.status}: ${started.data.message}` };
  const { runId } = started.data.run;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(1000);
    const { data } = await call("GET", `/api/chaos/runs/${runId}`);
    if (data.run && data.run.status !== "RUNNING") return data.run;
  }
  return { runId, status: "TIMEOUT" };
}

async function main() {
  const health = await call("GET", "/api/health");
  check("GET /api/health is healthy", health.status === 200 && health.data.status === "healthy");

  const created = await call("POST", "/api/orders", {
    customerName: "Smoke Test",
    deliveryAddress: "Ajmer Junction (smoke test)",
    destinationLatitude: 26.4563,
    destinationLongitude: 74.629,
  });
  const orderId = created.data.order?._id;
  check("Create order with road route", created.status === 201 && created.data.order?.routeCoordinates?.length >= 2,
    created.data.routeSummary ? `${created.data.routeSummary.routePoints} points via ${created.data.routeSummary.source}` : created.data.message);
  if (!orderId) return;

  const start = await call("POST", `/api/orders/${orderId}/simulate/start`);
  const again = await call("POST", `/api/orders/${orderId}/simulate/start`);
  check("Start rider simulation (idempotent)", start.status === 200 && again.data.message === "Simulation is already running");

  await sleep(4000);
  const tracking = await call("GET", `/api/orders/tracking/${orderId}`);
  check("Tracking reports LIVE with a confirmed timestamp",
    tracking.data.tracking?.state === "LIVE" && Boolean(tracking.data.tracking?.lastSuccessfulLocationAt),
    tracking.data.tracking?.state);

  const bad = await call("PATCH", `/api/orders/${orderId}/location`, { latitude: 500, longitude: 10 });
  check("Invalid location rejected with 400 and incident", bad.status === 400 && Boolean(bad.data.incidentId));

  const overview = await call("GET", "/api/reliability/overview");
  check("Overview returns metrics from incidents", overview.status === 200 && Number.isInteger(overview.data.metrics?.totalIncidents));

  const db = await runScenario("db_failure", null, { failCount: 2 }, 20000);
  check("Chaos: db_failure recovers after retries", db.status === "PASSED", db.observed || db.status);

  if (withNegative) {
    const dbFail = await runScenario("db_failure", null, { failCount: 5 }, 20000);
    check("Chaos: db_failure reports FAILED when retries run out", dbFail.status === "FAILED", dbFail.observed || dbFail.status);
  }

  const invalid = await runScenario("invalid_tracking_data", orderId, {}, 20000);
  check("Chaos: invalid_tracking_data protected", invalid.status === "PASSED", invalid.observed || invalid.status);

  const stuck = await runScenario("rider_tracking", orderId, { mode: "stuck_worker" }, 60000);
  check("Chaos: rider_tracking stuck worker recovered", stuck.status === "PASSED", stuck.observed || stuck.status);

  if (stuck.incidentId) {
    const { data } = await call("GET", `/api/reliability/incidents/${stuck.incidentId}`);
    const statuses = (data.incident?.timeline || []).map((entry) => entry.status).join(" > ");
    check("Same incident ID carries the whole lifecycle", statuses.startsWith("detected > diagnosing > recovering") && statuses.endsWith("recovered"), statuses);
  }

  if (withOsrm) {
    const osrm = await runScenario("osrm_outage", orderId, { durationMs: 5000 }, 60000);
    check("Chaos: osrm_outage degraded then recovered", osrm.status === "PASSED", osrm.observed || osrm.status);
  }

  await call("POST", `/api/orders/${orderId}/simulate/stop`);

  const failed = results.filter((result) => !result.passed).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error("Smoke test error:", error.message);
  process.exitCode = 1;
});
