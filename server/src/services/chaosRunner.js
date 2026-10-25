const crypto = require("crypto");
const mongoose = require("mongoose");
const ChaosRun = require("../models/ChaosRun");
const Incident = require("../models/Incident");
const Order = require("../models/Order");
const ReliabilityProbe = require("../models/ReliabilityProbe");
const faults = require("./faultInjector");
const sim = require("./riderSimulation");
const tracking = require("./trackingHealer");
const { openIncident, transition } = require("./incidentLifecycle");
const {
  configureRoutingChaos,
  getCircuitStatus,
  getRoadRouteWithHealing,
  makeCacheKey,
} = require("./osrmService");

const PICKUP = { latitude: 26.4499, longitude: 74.6399 };
// Default routing test destination (Ajmer Junction railway station).
const DEFAULT_DESTINATION = { latitude: 26.4563, longitude: 74.6290 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(Math.max(number, min), max) : fallback;
};

const SCENARIOS = {
  rider_tracking: {
    id: "rider_tracking",
    name: "Rider tracking failure",
    description:
      "Stops location updates for one order. 'stuck_worker' stalls the current tracking worker; 'device_offline' makes every location write fail for a bounded time.",
    risk: "Low — affects only the selected order's simulated rider for at most 30s.",
    requiresOrder: "running",
    params: {
      mode: { type: "enum", values: ["stuck_worker", "device_offline"], default: "stuck_worker" },
      durationMs: { type: "number", min: 5000, max: 30000, default: 12000, appliesTo: "device_offline" },
    },
    expected:
      "Monitor flags the location as stale, preserves the last valid location, restarts the worker and marks RECOVERED only after a fresh location is persisted.",
  },
  osrm_outage: {
    id: "osrm_outage",
    name: "OSRM routing outage",
    description:
      "Makes the routing wrapper fail every OSRM request for a bounded window, without contacting OSRM. Exercises retries, circuit breaker, cached fallback and the half-open probe.",
    risk: "Medium — all route calculations (including new orders) fail over to cache for the window.",
    requiresOrder: "optional",
    params: {
      durationMs: { type: "number", min: 3000, max: 20000, default: 5000 },
    },
    expected:
      "3 retries fail, circuit OPENs, cached route served (DEGRADED), then a half-open probe after cooldown returns a live route and the same incident becomes RECOVERED.",
  },
  db_failure: {
    id: "db_failure",
    name: "Database write failure",
    description:
      "Arms N simulated transient errors on a test-only probe write. Errors are thrown before MongoDB is contacted, so no data is changed.",
    risk: "None for real data — only a test probe collection (auto-expires after 24h) is written.",
    requiresOrder: "none",
    params: {
      failCount: { type: "number", min: 1, max: 5, default: 2 },
    },
    expected:
      "Safe retry with backoff (max 4 attempts). RECOVERED only after a read-after-write check; FAILED if every attempt fails.",
  },
  invalid_tracking_data: {
    id: "invalid_tracking_data",
    name: "Invalid tracking data",
    description:
      "Submits malformed and out-of-range coordinates through the real location-update path for the selected order.",
    risk: "Low — the updates are expected to be rejected; nothing is written if validation works.",
    requiresOrder: "any",
    params: {},
    expected:
      "Every payload rejected with HTTP 400, last valid location and progress kept, one incident recorded and verified.",
  },
  process_crash: {
    id: "process_crash",
    name: "API process crash",
    description:
      "Exits the Node.js process with code 1. Only available when the API runs under PM2 locally with ENABLE_CRASH_DEMO=true.",
    risk: "High — the API is unavailable until the supervisor restarts it (a few seconds).",
    requiresOrder: "none",
    params: {},
    expected:
      "PM2 restarts the process; on startup the API verifies MongoDB and its own /api/health, resumes rider workers and marks the incident RECOVERED.",
  },
};

let activeRun = null; // { runId, scenario }

function newRunId() {
  return `CR-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

function isSupervised() {
  return process.env.pm_id !== undefined || process.env.HEALTRACK_SUPERVISED === "true";
}

function crashDemoStatus() {
  if (process.env.NODE_ENV === "production") return { available: false, reason: "Disabled in production." };
  if (process.env.ENABLE_CRASH_DEMO !== "true") return { available: false, reason: "ENABLE_CRASH_DEMO is not true." };
  if (!isSupervised()) {
    return {
      available: false,
      reason: "API is not running under PM2. Start it with `npm run pm2:start` so a crash can be restarted.",
    };
  }
  return { available: true, reason: null };
}

async function step(runId, message) {
  await ChaosRun.updateOne({ runId }, { $push: { steps: { at: new Date(), message } } });
}

async function finish(runId, status, { observed, evidence = {}, incidentId } = {}) {
  // Release the lock before the final status becomes visible, so a client
  // that sees the result can start the next run immediately.
  if (activeRun?.runId === runId) activeRun = null;
  const run = await ChaosRun.findOne({ runId });
  if (!run) return;
  const finishedAt = new Date();
  run.status = status;
  run.observed = observed || run.observed;
  run.evidence = { ...(run.evidence || {}), ...evidence };
  run.markModified("evidence");
  if (incidentId) run.incidentId = incidentId;
  run.finishedAt = finishedAt;
  run.durationMs = finishedAt - run.startedAt;
  run.steps.push({ at: finishedAt, message: `Run finished: ${status}` });
  await run.save();
}

async function linkIncident(runId, incidentId) {
  await ChaosRun.updateOne({ runId }, { $set: { incidentId } });
}

async function waitForIncident(query, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const incident = await Incident.findOne(query).sort({ detectedAt: -1 });
    if (incident) return incident;
    await sleep(500);
  }
  return null;
}

async function waitForStatus(incidentId, statuses, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let incident = null;
  while (Date.now() < deadline) {
    incident = await Incident.findById(incidentId).lean();
    if (incident && statuses.includes(incident.status)) return incident;
    await sleep(500);
  }
  return incident;
}

// ---------------------------------------------------------------------------
// Scenario A — rider tracking failure
// ---------------------------------------------------------------------------
async function runRiderTracking(run, params) {
  const { runId } = run;
  const orderId = String(run.orderId);
  const worker = sim.getWorker(orderId);
  const order = await Order.findById(orderId).lean();

  if (!order || !worker || order.status === "Delivered") {
    return finish(runId, "BLOCKED", {
      observed: "The selected order has no running rider simulation. Start the rider in the Delivery console first.",
    });
  }

  const before = {
    latitude: order.location.latitude,
    longitude: order.location.longitude,
    routeProgress: order.routeProgress || 0,
    lastSuccessfulLocationAt: order.tracking?.lastSuccessfulLocationAt,
  };
  const injectedAt = new Date();

  faults.injectTrackingFault({
    orderId,
    mode: params.mode,
    generation: worker.generation,
    durationMs: params.mode === "device_offline" ? params.durationMs : 30000,
    runId,
  });
  await step(runId, params.mode === "stuck_worker"
    ? `Stalled tracking worker generation ${worker.generation} (fault ends when the worker is replaced, max 30s)`
    : `Rider device marked offline for ${params.durationMs} ms; every location write will fail`);

  try {
    const incident = await waitForIncident(
      { orderId: order._id, incidentType: tracking.STALE_TYPE, detectedAt: { $gte: injectedAt } },
      sim.STALE_AFTER_MS + 10000
    );

    if (!incident) {
      return finish(runId, "FAILED", { observed: "No stale-tracking incident was detected within the expected window." });
    }

    await linkIncident(runId, incident._id);
    await step(runId, `Incident ${incident._id} detected by the tracking monitor (TTD ${incident.detectionTimeMs} ms)`);

    const during = await Order.findById(orderId).lean();
    const preserved =
      sim.validCoordinates(during.location.latitude, during.location.longitude) &&
      (during.routeProgress || 0) >= before.routeProgress;
    await step(runId, preserved
      ? `Last valid location preserved during the fault (${during.location.latitude.toFixed(5)}, ${during.location.longitude.toFixed(5)}, progress ${during.routeProgress})`
      : "Stored location was NOT preserved during the fault");

    const final = await waitForStatus(incident._id, ["recovered", "degraded", "failed"], 60000);
    const after = await Order.findById(orderId).lean();
    const freshAfterDetection =
      after?.tracking?.lastSuccessfulLocationAt &&
      new Date(after.tracking.lastSuccessfulLocationAt) > new Date(incident.detectedAt);

    const evidence = {
      before,
      during: { latitude: during.location.latitude, longitude: during.location.longitude, routeProgress: during.routeProgress },
      after: after && {
        latitude: after.location.latitude,
        longitude: after.location.longitude,
        routeProgress: after.routeProgress,
        lastSuccessfulLocationAt: after.tracking?.lastSuccessfulLocationAt,
      },
      preservedDuringFault: preserved,
      freshLocationAfterDetection: Boolean(freshAfterDetection),
      incidentStatus: final?.status,
      retryCount: final?.retryCount,
      ttdMs: final?.detectionTimeMs,
      ttrMs: final?.recoveryTimeMs,
    };

    if (final?.status === "recovered" && preserved && freshAfterDetection) {
      return finish(runId, "PASSED", {
        incidentId: incident._id,
        evidence,
        observed: `Stale tracking detected in ${final.detectionTimeMs} ms, worker restarted (${final.retryCount + 1} attempt(s)), fresh location verified; TTR ${final.recoveryTimeMs} ms.`,
      });
    }
    if (final?.status === "degraded") {
      return finish(runId, "DEGRADED", {
        incidentId: incident._id,
        evidence,
        observed: "Recovery attempts could not produce a fresh location in time. Last confirmed location kept and shown as stale; the monitor keeps checking.",
      });
    }
    return finish(runId, "FAILED", {
      incidentId: incident._id,
      evidence,
      observed: `Incident ended as ${final?.status || "unknown"}; preserved=${preserved}, fresh=${Boolean(freshAfterDetection)}.`,
    });
  } finally {
    faults.clearTrackingFault(orderId);
  }
}

// ---------------------------------------------------------------------------
// Scenario B — OSRM outage
// ---------------------------------------------------------------------------
async function runOsrmOutage(run, params) {
  const { runId } = run;
  let destination = DEFAULT_DESTINATION;
  if (run.orderId) {
    const order = await Order.findById(run.orderId).lean();
    if (sim.validCoordinates(order?.destinationLocation?.latitude, order?.destinationLocation?.longitude)) {
      destination = { latitude: order.destinationLocation.latitude, longitude: order.destinationLocation.longitude };
    }
  }
  const origin = PICKUP;
  const routeKey = makeCacheKey(origin, destination);

  if (getCircuitStatus().circuitState !== "CLOSED") {
    return finish(runId, "BLOCKED", {
      observed: `Routing circuit is ${getCircuitStatus().circuitState}. Wait for it to close before running this test.`,
    });
  }

  // 1. Make sure a valid last-known route exists (real OSRM call).
  try {
    const primed = await getRoadRouteWithHealing(origin, destination);
    await step(runId, `Baseline route obtained from ${primed.source} (${primed.coordinates.length} points)`);
  } catch (error) {
    return finish(runId, "BLOCKED", {
      observed: `Real OSRM is unreachable before injection (${error.message}); cannot run a controlled test.`,
    });
  }

  // 2. Inject a bounded outage.
  const injectedAt = new Date();
  configureRoutingChaos("always", { durationMs: params.durationMs, runId });
  await step(runId, `Routing wrapper set to fail every request for ${params.durationMs} ms`);

  try {
    const first = await getRoadRouteWithHealing(origin, destination);
    await step(runId, `Request during outage: source=${first.source}, degraded=${first.degraded}, attempts=${first.attempts}, circuit=${first.circuit.circuitState}`);

    const incident = await Incident.findOne({ routeKey, detectedAt: { $gte: injectedAt } }).sort({ detectedAt: -1 });
    if (incident) {
      await linkIncident(runId, incident._id);
      await step(runId, `Incident ${incident._id} recorded (${incident.status})`);
    }

    const second = await getRoadRouteWithHealing(origin, destination);
    await step(runId, `Request while circuit OPEN: attempts=${second.attempts} (external call skipped), source=${second.source}`);

    // 3. Wait for the outage window and the circuit cooldown to pass.
    const waitDeadline = Date.now() + params.durationMs + 25000;
    while (Date.now() < waitDeadline) {
      const circuit = getCircuitStatus();
      if (circuit.failureMode === "off" && circuit.cooldownRemainingMs === 0) break;
      await sleep(500);
    }
    await step(runId, "Outage window ended and cooldown elapsed; sending half-open probe");

    let probe;
    try {
      probe = await getRoadRouteWithHealing(origin, destination);
    } catch (error) {
      probe = { source: "error", degraded: true, message: error.message, circuit: getCircuitStatus() };
    }
    await step(runId, `Probe result: source=${probe.source}, degraded=${probe.degraded}, circuit=${probe.circuit?.circuitState}`);

    const final = incident ? await Incident.findById(incident._id).lean() : null;
    const evidence = {
      routeKey,
      duringOutage: { source: first.source, degraded: first.degraded, attempts: first.attempts, circuit: first.circuit.circuitState },
      whileOpen: { source: second.source, attempts: second.attempts },
      probe: { source: probe.source, degraded: probe.degraded, circuit: probe.circuit?.circuitState, message: probe.message },
      incidentStatus: final?.status,
    };

    const fallbackWorked = first.source === "cache" && first.degraded;
    const liveRestored = probe.source === "osrm" && !probe.degraded && probe.circuit?.circuitState === "CLOSED";

    if (fallbackWorked && liveRestored && final?.status === "recovered") {
      return finish(runId, "PASSED", {
        incidentId: incident._id,
        evidence,
        observed: `Retries exhausted, circuit opened, cached route served while degraded, half-open probe restored live OSRM. TTR ${final.recoveryTimeMs} ms.`,
      });
    }
    if (fallbackWorked && !liveRestored) {
      return finish(runId, "DEGRADED", {
        incidentId: incident?._id,
        evidence,
        observed: `Fallback worked but live routing was not restored by the probe: ${probe.message}`,
      });
    }
    return finish(runId, "FAILED", {
      incidentId: incident?._id,
      evidence,
      observed: `Unexpected behaviour: fallback=${fallbackWorked}, live=${liveRestored}, incident=${final?.status || "none"}.`,
    });
  } finally {
    if (getCircuitStatus().failureMode !== "off") configureRoutingChaos("off");
  }
}

// ---------------------------------------------------------------------------
// Scenario C — database write failure
// ---------------------------------------------------------------------------
async function runDbFailure(run, params) {
  const { runId } = run;
  const MAX_ATTEMPTS = 4;
  const token = crypto.randomBytes(8).toString("hex");
  const op = "reliability-probe-write";

  if (mongoose.connection.readyState !== 1) {
    return finish(runId, "BLOCKED", { observed: "MongoDB is not connected; cannot run a controlled DB test." });
  }

  faults.injectDbFault({ op, failCount: params.failCount, runId });
  await step(runId, `Armed ${params.failCount} simulated transient error(s) on '${op}'`);

  let incident = null;
  let written = null;
  let attempts = 0;
  const errors = [];

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      attempts = attempt;
      try {
        written = await faults.guardedDbOp(op, () => ReliabilityProbe.create({ runId, token }));
        await step(runId, `Attempt ${attempt}: probe write succeeded (${written._id})`);
        if (incident) {
          await transition(incident._id, "recovering", {
            note: "Retry succeeded",
            retry: attempt > 1,
            action: { name: "retry_with_backoff", ok: true, detail: `Attempt ${attempt} succeeded.` },
          });
        }
        break;
      } catch (error) {
        errors.push(error.message);
        await step(runId, `Attempt ${attempt}: ${error.message}`);

        if (!incident) {
          incident = await openIncident({
            incidentType: "database_operation_failure",
            service: "mongodb",
            severity: "high",
            source: "chaos_lab",
            scenario: "db_failure",
            runId,
            diagnosis: error.message,
            evidence: { operation: op, errors },
          });
          await linkIncident(runId, incident._id);
          await transition(incident._id, "diagnosing", {
            note: "Classifying database error",
            rootCause: error.retryable
              ? "Transient database error on a write (retryable). Connection is still up, so a bounded retry is safe."
              : `Non-retryable database error: ${error.message}`,
            evidence: { readyState: mongoose.connection.readyState },
          });
          if (!error.retryable) break;
        }

        await transition(incident._id, "recovering", {
          note: "Retrying with exponential backoff",
          retry: attempt > 1,
          evidence: { errors },
          action: { name: "retry_with_backoff", ok: false, detail: `Attempt ${attempt} failed: ${error.message}` },
        });

        if (attempt < MAX_ATTEMPTS) await sleep(200 * 2 ** (attempt - 1));
      }
    }
  } finally {
    faults.clearDbFault();
  }

  if (!incident) {
    return finish(runId, "FAILED", { observed: "The injected fault did not trigger; no incident was created." });
  }

  if (!written) {
    await transition(incident._id, "failed", {
      note: "All retries failed",
      verification: { passed: false, detail: `${attempts} attempts failed; nothing was written.` },
    });
    return finish(runId, "FAILED", {
      incidentId: incident._id,
      evidence: { attempts, errors },
      observed: `All ${attempts} attempts failed; incident marked FAILED (safe: no partial data written).`,
    });
  }

  await transition(incident._id, "verifying", { note: "Read-after-write check" });
  const readBack = await ReliabilityProbe.findById(written._id).lean();
  const verified = readBack?.token === token;

  if (verified) {
    const final = await transition(incident._id, "recovered", {
      note: "Write verified by reading it back",
      verification: { passed: true, detail: `Probe ${written._id} read back with matching token after ${attempts} attempt(s).` },
    });
    return finish(runId, "PASSED", {
      incidentId: incident._id,
      evidence: { attempts, errors, probeId: String(written._id) },
      observed: `${errors.length} simulated failure(s), succeeded on attempt ${attempts}, read-after-write verified. TTR ${final.recoveryTimeMs} ms.`,
    });
  }

  await transition(incident._id, "failed", {
    note: "Read-after-write mismatch",
    verification: { passed: false, detail: "Probe document could not be read back." },
  });
  return finish(runId, "FAILED", { incidentId: incident._id, observed: "Write reported success but could not be read back." });
}

// ---------------------------------------------------------------------------
// Scenario E — invalid tracking data
// ---------------------------------------------------------------------------
async function runInvalidData(run) {
  const { runId } = run;
  const order = await Order.findById(run.orderId).lean();
  if (!order || !sim.validCoordinates(order.location?.latitude, order.location?.longitude)) {
    return finish(runId, "BLOCKED", { observed: "Selected order not found or has no valid stored location." });
  }

  const before = { latitude: order.location.latitude, longitude: order.location.longitude, routeProgress: order.routeProgress || 0 };
  const payloads = [
    { latitude: 999, longitude: 74.64 },
    { latitude: "abc", longitude: 74.64 },
    { latitude: 26.45, longitude: -500 },
    { latitude: null, longitude: null },
  ];

  const results = [];
  let incidentId = null;
  for (const payload of payloads) {
    try {
      await tracking.applyLocationUpdate(order._id, payload, { runId });
      results.push({ payload, rejected: false });
      await step(runId, `Payload ${JSON.stringify(payload)} was ACCEPTED (unexpected)`);
    } catch (error) {
      results.push({ payload, rejected: error.statusCode === 400, message: error.message });
      incidentId = incidentId || error.incidentId || null;
      await step(runId, `Payload ${JSON.stringify(payload)} rejected: ${error.message}`);
    }
  }

  if (incidentId) await linkIncident(runId, incidentId);

  const after = await Order.findById(order._id).lean();
  const incident = incidentId ? await Incident.findById(incidentId).lean() : null;
  const allRejected = results.every((r) => r.rejected);
  const preserved =
    sim.validCoordinates(after.location.latitude, after.location.longitude) &&
    (after.routeProgress || 0) >= before.routeProgress;

  const evidence = {
    results,
    before,
    after: { latitude: after.location.latitude, longitude: after.location.longitude, routeProgress: after.routeProgress },
    incidentStatus: incident?.status,
  };

  if (allRejected && preserved && incident?.status === "recovered") {
    return finish(runId, "PASSED", {
      incidentId,
      evidence,
      observed: `All ${payloads.length} invalid payloads rejected; last valid location and progress preserved; one incident recorded and verified.`,
    });
  }
  return finish(runId, "FAILED", {
    incidentId,
    evidence,
    observed: `allRejected=${allRejected}, preserved=${preserved}, incident=${incident?.status || "none"}.`,
  });
}

// ---------------------------------------------------------------------------
// Scenario D — process crash (completed on the next startup)
// ---------------------------------------------------------------------------
async function runProcessCrash(run) {
  const { runId } = run;
  const status = crashDemoStatus();
  if (!status.available) {
    return finish(runId, "BLOCKED", { observed: status.reason });
  }

  const incident = await openIncident({
    incidentType: "api_process_crash",
    service: "healtrack-api",
    severity: "high",
    source: "chaos_lab",
    scenario: "process_crash",
    runId,
    diagnosis: "Controlled API process exit (code 1) triggered from the Chaos Lab.",
    evidence: { pid: process.pid, pmId: process.env.pm_id ?? null, uptimeSeconds: Math.floor(process.uptime()) },
  });
  await linkIncident(runId, incident._id);
  await transition(incident._id, "diagnosing", {
    note: "Process exit is intentional",
    rootCause: "Node.js process terminated; requests cannot be served until the supervisor restarts it.",
  });
  await transition(incident._id, "recovering", {
    note: "Waiting for supervisor",
    action: { name: "supervisor_restart", ok: null, detail: "Waiting for PM2 to restart the process." },
  });
  await step(runId, `Incident ${incident._id} persisted; exiting process ${process.pid} in 500 ms`);

  setTimeout(() => process.exit(1), 500);
}

// Runs once after the server is listening again.
async function finalizeAfterStartup({ port }) {
  // Crash incidents waiting for a restart are verified now.
  const crashIncidents = await Incident.find({
    incidentType: "api_process_crash",
    status: { $in: ["recovering", "verifying"] },
  });

  for (const incident of crashIncidents) {
    try {
      await transition(incident._id, "verifying", { note: "Process restarted; running health checks" });
      const dbOk = mongoose.connection.readyState === 1 && (await mongoose.connection.db.admin().ping()).ok === 1;
      let healthOk = false;
      let healthStatus = null;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(5000) });
        healthStatus = response.status;
        healthOk = response.ok;
      } catch {
        healthOk = false;
      }
      const oldPid = incident.evidence?.pid;
      const newProcess = oldPid !== process.pid;
      const passed = dbOk && healthOk && newProcess;

      await transition(incident._id, passed ? "recovered" : "failed", {
        note: passed ? "Supervisor restart verified" : "Restart verification failed",
        action: {
          name: "supervisor_restart",
          ok: passed,
          detail: `Process restarted (pid ${oldPid} -> ${process.pid}).`,
        },
        verification: {
          passed,
          detail: `MongoDB ping ${dbOk ? "ok" : "failed"}; GET /api/health -> ${healthStatus ?? "unreachable"}; new pid ${process.pid} (was ${oldPid}).`,
        },
        evidence: { newPid: process.pid, restartedAt: new Date().toISOString() },
      });

      if (incident.runId) {
        const final = await Incident.findById(incident._id).lean();
        await finish(incident.runId, passed ? "PASSED" : "FAILED", {
          incidentId: incident._id,
          evidence: { oldPid, newPid: process.pid, dbOk, healthStatus },
          observed: passed
            ? `PM2 restarted the API (pid ${oldPid} -> ${process.pid}); health verified. Downtime/TTR ${final.recoveryTimeMs} ms.`
            : "Process restarted but health verification failed.",
        });
      }
    } catch (error) {
      console.error("Crash verification error:", error.message);
    }
  }

  // Any other run left RUNNING was interrupted by the restart.
  await ChaosRun.updateMany(
    { status: "RUNNING", scenario: { $ne: "process_crash" } },
    {
      $set: { status: "FAILED", observed: "Run interrupted by a server restart.", finishedAt: new Date() },
      $push: { steps: { at: new Date(), message: "Run interrupted by a server restart" } },
    }
  );

  return crashIncidents.length;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
function validateRequest({ scenario, orderId, params = {} }) {
  const definition = SCENARIOS[scenario];
  if (!definition) {
    const error = new Error(`Unknown scenario. Use one of: ${Object.keys(SCENARIOS).join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  const clean = {};
  if (scenario === "rider_tracking") {
    clean.mode = ["stuck_worker", "device_offline"].includes(params.mode) ? params.mode : "stuck_worker";
    clean.durationMs = clamp(params.durationMs, 5000, 30000, 12000);
  }
  if (scenario === "osrm_outage") clean.durationMs = clamp(params.durationMs, 3000, 20000, 5000);
  if (scenario === "db_failure") clean.failCount = Math.round(clamp(params.failCount, 1, 5, 2));

  if (["running", "any"].includes(definition.requiresOrder) && !mongoose.isValidObjectId(orderId)) {
    const error = new Error("This scenario needs a valid orderId");
    error.statusCode = 400;
    throw error;
  }
  if (orderId && !mongoose.isValidObjectId(orderId)) {
    const error = new Error("Invalid orderId");
    error.statusCode = 400;
    throw error;
  }

  return { definition, params: clean };
}

async function startRun({ scenario, orderId, params, triggeredBy }) {
  const { definition, params: clean } = validateRequest({ scenario, orderId, params });

  if (activeRun) {
    const error = new Error(`Another Chaos Lab run is in progress (${activeRun.runId}). Wait for it to finish.`);
    error.statusCode = 409;
    throw error;
  }

  const runId = newRunId();
  activeRun = { runId, scenario };

  const injectedFault = {
    rider_tracking: `Tracking fault '${clean.mode}' on order ${orderId}`,
    osrm_outage: `OSRM wrapper fails all requests for ${clean.durationMs} ms`,
    db_failure: `${clean.failCount} simulated transient error(s) on a probe write`,
    invalid_tracking_data: `4 invalid coordinate payloads for order ${orderId}`,
    process_crash: "process.exit(1) under PM2",
  }[scenario];

  let run;
  try {
    run = await ChaosRun.create({
      runId,
      scenario,
      params: clean,
      orderId: orderId || null,
      injectedFault,
      expected: definition.expected,
      triggeredBy,
      steps: [{ at: new Date(), message: "Run created" }],
    });
  } catch (error) {
    activeRun = null;
    throw error;
  }

  const executors = {
    rider_tracking: runRiderTracking,
    osrm_outage: runOsrmOutage,
    db_failure: runDbFailure,
    invalid_tracking_data: runInvalidData,
    process_crash: runProcessCrash,
  };

  executors[scenario](run, clean)
    .catch(async (error) => {
      console.error(`Chaos run ${runId} error:`, error);
      await finish(runId, "FAILED", { observed: `Runner error: ${error.message}` }).catch(() => {});
    })
    .finally(() => {
      activeRun = null;
    });

  return run.toObject();
}

function resetFaults() {
  faults.clearAll();
  configureRoutingChaos("off");
  return { faults: faults.snapshot(), routing: getCircuitStatus() };
}

function getStatus() {
  return {
    activeRun,
    faults: faults.snapshot(),
    routing: getCircuitStatus(),
    crashDemo: crashDemoStatus(),
    supervised: isSupervised(),
  };
}

module.exports = {
  SCENARIOS,
  startRun,
  resetFaults,
  getStatus,
  crashDemoStatus,
  isSupervised,
  finalizeAfterStartup,
};
