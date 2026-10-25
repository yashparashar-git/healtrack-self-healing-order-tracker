//   const Order = require("../models/Order");
//   const Incident = require("../models/Incident");
//   const { openIncident, transition, OPEN_STATUSES, IN_PROGRESS_STATUSES } = require("./incidentLifecycle");
//   // const { findTrackingFault } = require("./faultInjector");
//   const {
//   findTrackingFault,
//   clearTrackingFault,
// } = require("./faultInjector");
//   const sim = require("./riderSimulation");

//   const MONITOR_INTERVAL_MS = 2000;
//   const MAX_RECOVERY_ATTEMPTS = 3;
//   const VERIFY_WINDOW_MS = sim.UPDATE_INTERVAL_MS * 2 + 1500;
//   const INVALID_DATA_DEDUP_MS = 60000;
//   const RECENTLY_RECOVERED_MS = 15000;

//   const STALE_TYPE = "rider_tracking_stale";
//   const INVALID_TYPE = "invalid_tracking_data";

//   const recoveriesInProgress = new Set(); // orderIds
//   const monitorState = { timer: null, lastRunAt: null, lastError: null, checksRun: 0 };

//   const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

//   function lastConfirmedAt(order) {
//     return order.tracking?.lastSuccessfulLocationAt || order.location?.updatedAt || null;
//   }

//   function hasValidLocation(order) {
//     return sim.validCoordinates(order.location?.latitude, order.location?.longitude);
//   }

//   // Chaos faults are only consulted to label an incident's source; detection
//   // and diagnosis rely on observed evidence alone.
//   function chaosLabel(orderId) {
//     const fault = findTrackingFault(orderId);
//     return fault ? { source: "chaos_lab", runId: fault.runId, scenario: "rider_tracking" } : { source: "monitor" };
//   }

//   async function findOpenIncident(orderId, incidentType) {
//     return Incident.findOne({ orderId, incidentType, status: { $in: OPEN_STATUSES } }).sort({ detectedAt: -1 });
//   }

//   function collectEvidence(order) {
//     const worker = sim.getWorker(order._id);
//     const confirmedAt = lastConfirmedAt(order);
//     const now = Date.now();
//     return {
//       locationAgeMs: confirmedAt ? now - new Date(confirmedAt).getTime() : null,
//       lastSuccessfulLocationAt: confirmedAt,
//       lastValidLocation: hasValidLocation(order)
//         ? { latitude: order.location.latitude, longitude: order.location.longitude }
//         : null,
//       routeProgress: order.routeProgress || 0,
//       routePoints: order.routeCoordinates?.length || 0,
//       orderStatus: order.status,
//       workerRunning: Boolean(worker),
//       workerGeneration: worker?.generation ?? null,
//       workerLastTickAgeMs: worker?.lastTickAt ? now - worker.lastTickAt : null,
//       workerLastWriteAgeMs: worker?.lastWriteAt ? now - worker.lastWriteAt : null,
//       lastError: order.tracking?.lastError || null,
//       lastErrorAt: order.tracking?.lastErrorAt || null,
//       consecutiveFailures: order.tracking?.consecutiveFailures || 0,
//     };
//   }

//   // Rule-based diagnosis from observed evidence.
//   function diagnose(evidence) {
//     if (!evidence.workerRunning) {
//       return {
//         rootCause: "Tracking worker is not running although the order expects live tracking.",
//         action: "resume_worker",
//       };
//     }
//     const errorIsRecent =
//       evidence.lastErrorAt && Date.now() - new Date(evidence.lastErrorAt).getTime() < sim.STALE_AFTER_MS * 2;
//     if (evidence.consecutiveFailures > 0 && errorIsRecent) {
//       return {
//         rootCause: `Location writes are failing: ${evidence.lastError}`,
//         action: "restart_worker_with_backoff",
//       };
//     }
//     if (evidence.workerLastTickAgeMs !== null && evidence.workerLastTickAgeMs < sim.UPDATE_INTERVAL_MS * 2) {
//       return {
//         rootCause: "Tracking worker is ticking but has stopped producing location updates (stalled worker).",
//         action: "restart_worker",
//       };
//     }
//     return {
//       rootCause: "Tracking worker is unresponsive; no ticks or location updates observed.",
//       action: "restart_worker",
//     };
//   }

//   async function waitForFreshLocation(orderId, sinceMs, timeoutMs) {
//     const deadline = Date.now() + timeoutMs;
//     while (Date.now() < deadline) {
//       await sleep(500);
//       const order = await Order.findById(orderId).lean();
//       const confirmed = order?.tracking?.lastSuccessfulLocationAt;
//       if (order && confirmed && new Date(confirmed).getTime() > sinceMs) return order;
//     }
//     return null;
//   }

//   async function recoverTracking(incidentId, orderId) {
//     orderId = String(orderId);
//     if (recoveriesInProgress.has(orderId)) return;
//     recoveriesInProgress.add(orderId);

//     try {
//       const order = await Order.findById(orderId);
//       if (!order) return;

//       const evidence = collectEvidence(order);
//       const plan = diagnose(evidence);
//       await transition(incidentId, "diagnosing", {
//         note: "Collecting worker and location evidence",
//         evidence,
//         rootCause: plan.rootCause,
//       });

//       const progressBefore = order.routeProgress || 0;

//       for (let attempt = 1; attempt <= MAX_RECOVERY_ATTEMPTS; attempt++) {
//         const current = await Order.findById(orderId).lean();
//         if (!current) return;

//         // The operator stopped tracking or the order finished; nothing to heal.
//         if (!current.tracking?.simulationActive || current.status === "Delivered") {
//           await transition(incidentId, "degraded", {
//             note: "Tracking was stopped or the order completed during recovery",
//             action: { name: "abort_recovery", ok: false, detail: "Tracking no longer active; last confirmed location preserved." },
//           });
//           return;
//         }

//         const attemptStartedAt = Date.now();
//         let actionOk = true;
//         let actionDetail;
//         try {
//           const result = await sim.restartWorker(orderId);
//           actionDetail = `Attempt ${attempt}: tracking worker restarted from saved progress ${current.routeProgress || 0} (generation ${result.generation}).`;
//         } catch (error) {
//           actionOk = false;
//           actionDetail = `Attempt ${attempt}: worker restart failed: ${error.message}`;
//         }

//         await transition(incidentId, "recovering", {
//           note: plan.action,
//           action: { name: plan.action, ok: actionOk, detail: actionDetail },
//           retry: attempt > 1,
//         });

//         const fresh = actionOk ? await waitForFreshLocation(orderId, attemptStartedAt, VERIFY_WINDOW_MS) : null;

//         if (fresh) {
//           await transition(incidentId, "verifying", { note: "Fresh location persisted; checking it" });

//           const verified = await Order.findById(orderId).lean();
//           const checks = {
//             freshWrite: new Date(verified.tracking.lastSuccessfulLocationAt).getTime() > attemptStartedAt,
//             validCoordinates: hasValidLocation(verified),
//             progressNotReset: (verified.routeProgress || 0) >= progressBefore,
//             workerRunning: sim.isRunning(orderId),
//           };
//           const passed = Object.values(checks).every(Boolean);

//           if (passed) {
//             await transition(incidentId, "recovered", {
//               note: "Live tracking resumed and verified",
//               verification: {
//                 passed: true,
//                 detail: `Fresh location written at ${new Date(verified.tracking.lastSuccessfulLocationAt).toISOString()} ` +
//                   `(${verified.location.latitude.toFixed(5)}, ${verified.location.longitude.toFixed(5)}); ` +
//                   `progress ${progressBefore} -> ${verified.routeProgress}; worker running.`,
//               },
//               evidence: { verificationChecks: checks },
//             });
//             return;
//           }

//           await transition(incidentId, "recovering", {
//             note: "Verification failed; retrying",
//             verification: { passed: false, detail: `Checks failed: ${JSON.stringify(checks)}` },
//           });
//         }

//         if (attempt < MAX_RECOVERY_ATTEMPTS) await sleep(1000 * attempt);
//       }

//       const latest = await Order.findById(orderId).lean();
//       await transition(incidentId, "degraded", {
//         note: "Recovery attempts exhausted",
//         action: {
//           name: "preserve_last_known_location",
//           ok: true,
//           detail: "Tracking still unavailable. Customer sees the last confirmed location marked as stale; monitor keeps checking.",
//         },
//         verification: { passed: false, detail: "No fresh location was persisted after recovery attempts." },
//         evidence: { finalState: latest ? collectEvidence(latest) : null },
//       });
//     } catch (error) {
//       console.error("Tracking recovery error:", error.message);
//       try {
//         await transition(incidentId, "failed", {
//           note: "Recovery engine error",
//           action: { name: "recovery_engine_error", ok: false, detail: error.message },
//         });
//       } catch {
//         /* already logged */
//       }
//     } finally {
//       recoveriesInProgress.delete(orderId);
//     }
//   }

//   // A degraded incident is resolved later only if a fresh location is verified.
//   async function checkDegradedIncident(incident, order) {
//     const confirmed = order.tracking?.lastSuccessfulLocationAt;
//     const lastUpdate = incident.timeline[incident.timeline.length - 1]?.at || incident.updatedAt;
//     if (!confirmed || new Date(confirmed) <= new Date(lastUpdate)) return;
//     if (Date.now() - new Date(confirmed).getTime() > sim.STALE_AFTER_MS) return;

//     await transition(incident._id, "verifying", { note: "Fresh location observed after degraded period" });
//     await transition(incident._id, "recovered", {
//       note: "Tracking resumed after degraded period",
//       verification: {
//         passed: true,
//         detail: `Fresh location written at ${new Date(confirmed).toISOString()} after the degraded period.`,
//       },
//     });
//   }

//   async function monitorOnce() {
//     const orders = await Order.find({
//       "tracking.simulationActive": true,
//       status: { $ne: "Delivered" },
//     });

//     for (const order of orders) {
//       const orderId = String(order._id);
//       if (recoveriesInProgress.has(orderId) || sim.wasRecentlyStopped(orderId)) continue;

//       const open = await findOpenIncident(order._id, STALE_TYPE);
//       if (open?.status === "degraded") {
//         await checkDegradedIncident(open, order);
//         continue;
//       }
//       if (open && IN_PROGRESS_STATUSES.includes(open.status)) {
//         // An in-progress incident without a running recovery (e.g. after a
//         // server restart) is picked up again.
//         recoverTracking(open._id, orderId);
//         continue;
//       }

//       // Give a freshly started or resumed worker time for its first update.
//       const worker = sim.getWorker(orderId);
//       if (worker && Date.now() - worker.startedAt < sim.STALE_AFTER_MS) continue;

//       const confirmedAt = lastConfirmedAt(order);
//       const ageMs = confirmedAt ? Date.now() - new Date(confirmedAt).getTime() : Infinity;
//       const workerMissing = !worker;

//       if (ageMs <= sim.STALE_AFTER_MS && !workerMissing) continue;

//       const evidence = collectEvidence(order);
//       // The first missed update was expected one interval after the last write.
//       const faultStartedAt = confirmedAt
//         ? new Date(new Date(confirmedAt).getTime() + sim.UPDATE_INTERVAL_MS)
//         : new Date();
//       const label = chaosLabel(orderId);

//       const incident = await openIncident({
//         incidentType: STALE_TYPE,
//         service: "rider-tracking",
//         severity: "high",
//         orderId: order._id,
//         faultStartedAt: faultStartedAt > new Date() ? new Date() : faultStartedAt,
//         diagnosis: workerMissing
//           ? "Tracking worker missing for an active delivery"
//           : `Rider location stale for ${Math.round(ageMs / 1000)}s (threshold ${sim.STALE_AFTER_MS / 1000}s)`,
//         evidence,
//         ...label,
//       });

//       recoverTracking(incident._id, orderId);
//     }
//   }

//   function startMonitor() {
//     if (monitorState.timer) return;
//     let running = false;
//     monitorState.timer = setInterval(async () => {
//       if (running) return;
//       running = true;
//       try {
//         await monitorOnce();
//         monitorState.lastError = null;
//       } catch (error) {
//         monitorState.lastError = error.message;
//         console.error("Tracking monitor error:", error.message);
//       } finally {
//         monitorState.lastRunAt = Date.now();
//         monitorState.checksRun += 1;
//         running = false;
//       }
//     }, MONITOR_INTERVAL_MS);
//   }

//   function getMonitorStatus() {
//     const lastRunAgeMs = monitorState.lastRunAt ? Date.now() - monitorState.lastRunAt : null;
//     return {
//       running: Boolean(monitorState.timer) && lastRunAgeMs !== null && lastRunAgeMs < MONITOR_INTERVAL_MS * 5,
//       intervalMs: MONITOR_INTERVAL_MS,
//       lastRunAt: monitorState.lastRunAt ? new Date(monitorState.lastRunAt).toISOString() : null,
//       lastError: monitorState.lastError,
//       checksRun: monitorState.checksRun,
//       recoveriesInProgress: [...recoveriesInProgress],
//       staleAfterMs: sim.STALE_AFTER_MS,
//     };
//   }

//   // ---------------------------------------------------------------------------
//   // Location updates submitted by a rider device (PATCH /api/orders/:id/location)
//   // ---------------------------------------------------------------------------

//   function describeInvalid(body) {
//     const lat = body?.latitude;
//     const lng = body?.longitude;
//     if (lat === undefined || lng === undefined || lat === null || lng === null || lat === "" || lng === "") {
//       return "latitude and longitude are required";
//     }
//     if (typeof lat !== "number" || typeof lng !== "number") {
//       const latitude = Number(lat);
//       const longitude = Number(lng);
//       if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "coordinates must be numeric";
//     }
//     const latitude = Number(lat);
//     const longitude = Number(lng);
//     if (latitude < -90 || latitude > 90) return `latitude ${latitude} is outside -90..90`;
//     if (longitude < -180 || longitude > 180) return `longitude ${longitude} is outside -180..180`;
//     return null;
//   }

//   // Records rejected data and verifies the stored location was protected.
//   async function recordInvalidData(order, payload, reason, { runId = null } = {}) {
//     const before = {
//       latitude: order.location?.latitude,
//       longitude: order.location?.longitude,
//       routeProgress: order.routeProgress || 0,
//     };
//     const rejected = { payload, reason, at: new Date().toISOString() };

//     // Deduplicate: one incident per order per minute; later rejections are
//     // appended as evidence instead of creating new incidents.
//     const recent = await Incident.findOne({
//       orderId: order._id,
//       incidentType: INVALID_TYPE,
//       detectedAt: { $gte: new Date(Date.now() - INVALID_DATA_DEDUP_MS) },
//     }).sort({ detectedAt: -1 });

//     if (recent) {
//       const list = Array.isArray(recent.evidence?.rejectedUpdates) ? recent.evidence.rejectedUpdates : [];
//       await Incident.updateOne(
//         { _id: recent._id },
//         { $set: { "evidence.rejectedUpdates": [...list, rejected].slice(-20) } }
//       );
//       return { incidentId: recent._id, deduplicated: true };
//     }

//     const incident = await openIncident({
//       incidentType: INVALID_TYPE,
//       service: "rider-tracking",
//       severity: "medium",
//       orderId: order._id,
//       source: runId ? "chaos_lab" : "monitor",
//       scenario: runId ? "invalid_tracking_data" : null,
//       runId,
//       diagnosis: `Invalid location update rejected: ${reason}`,
//       evidence: { rejectedUpdates: [rejected], locationBefore: before },
//     });

//     await transition(incident._id, "diagnosing", {
//       note: "Classifying rejected payload",
//       rootCause: `Malformed or out-of-range coordinates from the rider device (${reason}). Validation is a non-retryable error.`,
//     });
//     await transition(incident._id, "recovering", {
//       note: "Protective action",
//       action: {
//         name: "reject_and_preserve_last_valid",
//         ok: true,
//         detail: "Update rejected with HTTP 400; the last valid location, status and route progress were kept.",
//       },
//     });
//     await transition(incident._id, "verifying", { note: "Re-reading stored order" });

//     const stored = await Order.findById(order._id).lean();
//     const storedValid = stored && hasValidLocation(stored);
//     const progressKept = stored && (stored.routeProgress || 0) >= before.routeProgress;
//     const notOverwritten =
//       stored && !(String(stored.location.latitude) === String(payload?.latitude) &&
//         String(stored.location.longitude) === String(payload?.longitude));

//     if (storedValid && progressKept && notOverwritten) {
//       await transition(incident._id, "recovered", {
//         note: "Stored tracking data verified intact",
//         verification: {
//           passed: true,
//           detail: `Stored location (${stored.location.latitude.toFixed(5)}, ${stored.location.longitude.toFixed(5)}) is valid; ` +
//             `progress ${stored.routeProgress || 0} >= ${before.routeProgress}; status ${stored.status}.`,
//         },
//         evidence: { locationAfter: { latitude: stored.location.latitude, longitude: stored.location.longitude, routeProgress: stored.routeProgress } },
//       });
//     } else {
//       await transition(incident._id, "failed", {
//         note: "Stored data did not match the protected state",
//         verification: { passed: false, detail: JSON.stringify({ storedValid, progressKept, notOverwritten }) },
//       });
//     }

//     return { incidentId: incident._id, deduplicated: false };
//   }

//   // Validates and persists a location sent by a rider device.
//   async function applyLocationUpdate(orderId, body, { runId = null } = {}) {
//     const order = await Order.findById(orderId);
//     if (!order) {
//       const error = new Error("Order not found");
//       error.statusCode = 404;
//       throw error;
//     }

//     const reason = describeInvalid(body);
//     if (reason) {
//       const result = await recordInvalidData(order, { latitude: body?.latitude, longitude: body?.longitude }, reason, { runId });
//       const error = new Error(`Location update rejected: ${reason}. Last valid location kept.`);
//       error.statusCode = 400;
//       error.incidentId = result.incidentId;
//       throw error;
//     }

//     await sim.writeConfirmedLocation(order, {
//       latitude: Number(body.latitude),
//       longitude: Number(body.longitude),
//     });
//     return order;
//   }

//   // Customer-facing tracking state derived from stored data only.
//   async function getTrackingState(order) {
//     const worker = sim.getWorker(order._id);
//     const confirmedAt = lastConfirmedAt(order);
//     const ageMs = confirmedAt ? Date.now() - new Date(confirmedAt).getTime() : null;

//     const incident = await Incident.findOne({ orderId: order._id, incidentType: STALE_TYPE })
//       .sort({ detectedAt: -1 })
//       .select("status detectedAt recoveredAt diagnosis rootCause recoveryAction retryCount timeline")
//       .lean();

//     let state;
//     if (order.status === "Delivered") state = "DELIVERED";
//     else if (!hasValidLocation(order)) state = "UNAVAILABLE";
//     else if (incident && IN_PROGRESS_STATUSES.includes(incident.status)) state = "RECONNECTING";
//     else if (!worker && !order.tracking?.simulationActive) state = "PAUSED";
//     else if (incident?.status === "degraded" || ageMs === null || ageMs > sim.STALE_AFTER_MS) state = "STALE";
//     else if (incident?.status === "recovered" && Date.now() - new Date(incident.recoveredAt).getTime() < RECENTLY_RECOVERED_MS) state = "RECOVERED";
//     else state = "LIVE";

//     const showIncident = incident && (OPEN_STATUSES.includes(incident.status) ||
//       (incident.recoveredAt && Date.now() - new Date(incident.recoveredAt).getTime() < RECENTLY_RECOVERED_MS * 2));

//     return {
//       state,
//       lastSuccessfulLocationAt: confirmedAt,
//       locationAgeMs: ageMs,
//       staleAfterMs: sim.STALE_AFTER_MS,
//       workerRunning: Boolean(worker),
//       lastError: order.tracking?.lastError || null,
//       lastErrorAt: order.tracking?.lastErrorAt || null,
//       consecutiveFailures: order.tracking?.consecutiveFailures || 0,
//       incident: showIncident
//         ? {
//             id: incident._id,
//             status: incident.status,
//             diagnosis: incident.rootCause || incident.diagnosis,
//             recoveryAction: incident.recoveryAction,
//             retryCount: incident.retryCount,
//             detectedAt: incident.detectedAt,
//             recoveredAt: incident.recoveredAt,
//           }
//         : null,
//     };
//   }
//   async function recoverTrackingManually(incidentId) {
//   if (!Incident.db?.readyState) {
//     const error = new Error("Database connection is unavailable.");
//     error.statusCode = 503;
//     throw error;
//   }

//   const incident = await Incident.findById(incidentId);

//   if (!incident) {
//     const error = new Error("Incident not found.");
//     error.statusCode = 404;
//     throw error;
//   }

//   if (incident.incidentType !== STALE_TYPE) {
//     const error = new Error(
//       "Manual recovery is currently supported only for rider tracking incidents."
//     );
//     error.statusCode = 400;
//     throw error;
//   }

//   if (incident.status === "recovered") {
//     const error = new Error("This incident is already recovered.");
//     error.statusCode = 409;
//     throw error;
//   }

//   if (IN_PROGRESS_STATUSES.includes(incident.status)) {
//     const error = new Error("Recovery is already in progress for this incident.");
//     error.statusCode = 409;
//     throw error;
//   }

//   if (!["detected", "degraded", "failed"].includes(incident.status)) {
//     const error = new Error(
//       `Manual recovery is not allowed for incident status: ${incident.status}`
//     );
//     error.statusCode = 409;
//     throw error;
//   }

//   if (!incident.orderId) {
//     const error = new Error("This incident is not linked to an order.");
//     error.statusCode = 400;
//     throw error;
//   }

//   const orderId = String(incident.orderId);

//   if (recoveriesInProgress.has(orderId)) {
//     const error = new Error("Another recovery is already running for this order.");
//     error.statusCode = 409;
//     throw error;
//   }

//   const order = await Order.findById(orderId);

//   if (!order) {
//     const error = new Error("The linked order no longer exists.");
//     error.statusCode = 404;
//     throw error;
//   }

//   if (order.status === "Delivered" || !order.tracking?.simulationActive) {
//     const error = new Error(
//       "Tracking is stopped or the order is delivered. Recovery cannot continue."
//     );
//     error.statusCode = 409;
//     throw error;
//   }

//   // Clear only this order's injected fault, and only for Chaos Lab incidents.
//   if (incident.source === "chaos_lab") {
//     clearTrackingFault(orderId);
//   }

//   await recoverTracking(incident._id, orderId);

//   const updatedIncident = await Incident.findById(incident._id).lean();

//   if (updatedIncident?.status !== "recovered") {
//     const error = new Error(
//       updatedIncident?.timeline?.slice(-1)[0]?.note ||
//         "Recovery could not be verified. The incident remains unresolved."
//     );
//     error.statusCode = 422;
//     error.incident = updatedIncident;
//     throw error;
//   }

//   return updatedIncident;
// }

//   module.exports = {
//   STALE_TYPE,
//   INVALID_TYPE,
//   startMonitor,
//   getMonitorStatus,
//   applyLocationUpdate,
//   getTrackingState,
//   collectEvidence,
//   recoverTrackingManually,
// };
const Order = require("../models/Order");
const Incident = require("../models/Incident");
const {
  openIncident,
  transition,
  OPEN_STATUSES,
  IN_PROGRESS_STATUSES,
} = require("./incidentLifecycle");
const { findTrackingFault, clearTrackingFault } = require("./faultInjector");
const sim = require("./riderSimulation");

const MONITOR_INTERVAL_MS = 2000;
const MAX_RECOVERY_ATTEMPTS = 3;
const VERIFY_WINDOW_MS = sim.UPDATE_INTERVAL_MS * 2 + 1500;
const INVALID_DATA_DEDUP_MS = 60000;
const RECENTLY_RECOVERED_MS = 15000;

const STALE_TYPE = "rider_tracking_stale";
const INVALID_TYPE = "invalid_tracking_data";

const recoveriesInProgress = new Set();
const monitorState = { timer: null, lastRunAt: null, lastError: null, checksRun: 0 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function lastConfirmedAt(order) {
  return order.tracking?.lastSuccessfulLocationAt || order.location?.updatedAt || null;
}

function hasValidLocation(order) {
  return sim.validCoordinates(order.location?.latitude, order.location?.longitude);
}

function chaosLabel(orderId) {
  const fault = findTrackingFault(orderId);
  return fault
    ? { source: "chaos_lab", runId: fault.runId, scenario: "rider_tracking" }
    : { source: "monitor" };
}

async function findOpenIncident(orderId, incidentType) {
  return Incident.findOne({
    orderId,
    incidentType,
    status: { $in: OPEN_STATUSES },
  }).sort({ detectedAt: -1 });
}

function collectEvidence(order) {
  const worker = sim.getWorker(order._id);
  const confirmedAt = lastConfirmedAt(order);
  const now = Date.now();

  return {
    locationAgeMs: confirmedAt ? now - new Date(confirmedAt).getTime() : null,
    lastSuccessfulLocationAt: confirmedAt,
    lastValidLocation: hasValidLocation(order)
      ? { latitude: order.location.latitude, longitude: order.location.longitude }
      : null,
    routeProgress: order.routeProgress || 0,
    routePoints: order.routeCoordinates?.length || 0,
    orderStatus: order.status,
    workerRunning: Boolean(worker),
    workerGeneration: worker?.generation ?? null,
    workerLastTickAgeMs: worker?.lastTickAt ? now - worker.lastTickAt : null,
    workerLastWriteAgeMs: worker?.lastWriteAt ? now - worker.lastWriteAt : null,
    lastError: order.tracking?.lastError || null,
    lastErrorAt: order.tracking?.lastErrorAt || null,
    consecutiveFailures: order.tracking?.consecutiveFailures || 0,
  };
}

function diagnose(evidence) {
  if (!evidence.workerRunning) {
    return {
      rootCause: "Tracking worker is not running although the order expects live tracking.",
      action: "resume_worker",
    };
  }

  const errorIsRecent =
    evidence.lastErrorAt &&
    Date.now() - new Date(evidence.lastErrorAt).getTime() < sim.STALE_AFTER_MS * 2;

  if (evidence.consecutiveFailures > 0 && errorIsRecent) {
    return {
      rootCause: `Location writes are failing: ${evidence.lastError}`,
      action: "restart_worker_with_backoff",
    };
  }

  if (
    evidence.workerLastTickAgeMs !== null &&
    evidence.workerLastTickAgeMs < sim.UPDATE_INTERVAL_MS * 2
  ) {
    return {
      rootCause: "Tracking worker is ticking but has stopped producing location updates (stalled worker).",
      action: "restart_worker",
    };
  }

  return {
    rootCause: "Tracking worker is unresponsive; no ticks or location updates observed.",
    action: "restart_worker",
  };
}

async function waitForFreshLocation(orderId, sinceMs, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(500);
    const order = await Order.findById(orderId).lean();
    const confirmed = order?.tracking?.lastSuccessfulLocationAt;

    if (order && confirmed && new Date(confirmed).getTime() > sinceMs) {
      return order;
    }
  }

  return null;
}

// This function is only called after an explicit manual recovery request.
async function recoverTracking(incidentId, orderId) {
  orderId = String(orderId);

  try {
    const order = await Order.findById(orderId);

    if (!order) {
      await transition(incidentId, "failed", {
        note: "Linked order was not found.",
        action: {
          name: "validate_order",
          ok: false,
          detail: "The order linked to this incident no longer exists.",
        },
        verification: { passed: false, detail: "Order not found." },
      });
      return;
    }

    const evidence = collectEvidence(order);
    const plan = diagnose(evidence);

    await transition(incidentId, "diagnosing", {
      note: "Collecting worker and location evidence",
      evidence,
      rootCause: plan.rootCause,
    });

    const progressBefore = order.routeProgress || 0;

    for (let attempt = 1; attempt <= MAX_RECOVERY_ATTEMPTS; attempt++) {
      const current = await Order.findById(orderId).lean();

      if (!current) {
        await transition(incidentId, "failed", {
          note: "Order disappeared during recovery.",
          action: { name: "validate_order", ok: false, detail: "Order not found." },
          verification: { passed: false, detail: "Order not found during recovery." },
        });
        return;
      }

      if (!current.tracking?.simulationActive || current.status === "Delivered") {
        await transition(incidentId, "degraded", {
          note: "Tracking was stopped or the order finished during recovery.",
          action: {
            name: "abort_recovery",
            ok: false,
            detail: "Tracking no longer active; last confirmed location preserved.",
          },
          verification: {
            passed: false,
            detail: "Recovery stopped because tracking is inactive or the order is delivered.",
          },
        });
        return;
      }

      const attemptStartedAt = Date.now();
      let actionOk = true;
      let actionDetail;

      try {
        const result = await sim.restartWorker(orderId);
        actionDetail =
          `Attempt ${attempt}: tracking worker restarted from saved progress ` +
          `${current.routeProgress || 0} (generation ${result.generation}).`;
      } catch (error) {
        actionOk = false;
        actionDetail = `Attempt ${attempt}: worker restart failed: ${error.message}`;
      }

      await transition(incidentId, "recovering", {
        note: plan.action,
        action: { name: plan.action, ok: actionOk, detail: actionDetail },
        retry: attempt > 1,
      });

      const fresh = actionOk
        ? await waitForFreshLocation(orderId, attemptStartedAt, VERIFY_WINDOW_MS)
        : null;

      if (fresh) {
        await transition(incidentId, "verifying", {
          note: "Fresh location persisted; checking recovery conditions",
        });

        const verified = await Order.findById(orderId).lean();

        if (!verified) {
          await transition(incidentId, "failed", {
            note: "Order disappeared during verification.",
            verification: { passed: false, detail: "Could not re-read the order." },
          });
          return;
        }

        const lastWrite = verified.tracking?.lastSuccessfulLocationAt;
        const checks = {
          freshWrite: Boolean(lastWrite && new Date(lastWrite).getTime() > attemptStartedAt),
          validCoordinates: hasValidLocation(verified),
          progressNotReset: (verified.routeProgress || 0) >= progressBefore,
          workerRunning: sim.isRunning(orderId),
        };

        if (Object.values(checks).every(Boolean)) {
          await transition(incidentId, "recovered", {
            note: "Live tracking resumed and verified",
            verification: {
              passed: true,
              detail:
                `Fresh location written at ${new Date(lastWrite).toISOString()} ` +
                `(${verified.location.latitude.toFixed(5)}, ${verified.location.longitude.toFixed(5)}); ` +
                `progress ${progressBefore} -> ${verified.routeProgress}; worker running.`,
            },
            evidence: { verificationChecks: checks },
          });
          return;
        }

        await transition(incidentId, "recovering", {
          note: "Verification failed; retrying",
          verification: {
            passed: false,
            detail: `Checks failed: ${JSON.stringify(checks)}`,
          },
        });
      }

      if (attempt < MAX_RECOVERY_ATTEMPTS) {
        await sleep(1000 * attempt);
      }
    }

    const latest = await Order.findById(orderId).lean();

    await transition(incidentId, "degraded", {
      note: "Recovery attempts exhausted",
      action: {
        name: "preserve_last_known_location",
        ok: true,
        detail:
          "Tracking remains unavailable. The last confirmed location is preserved and should be displayed as stale.",
      },
      verification: {
        passed: false,
        detail: "No fresh location was persisted after recovery attempts.",
      },
      evidence: { finalState: latest ? collectEvidence(latest) : null },
    });
  } catch (error) {
    console.error("Tracking recovery error:", error.message);

    try {
      const currentIncident = await Incident.findById(incidentId).lean();

      if (currentIncident && !["recovered", "failed"].includes(currentIncident.status)) {
        await transition(incidentId, "failed", {
          note: "Recovery engine error",
          action: {
            name: "recovery_engine_error",
            ok: false,
            detail: error.message,
          },
          verification: { passed: false, detail: "Recovery did not complete successfully." },
        });
      }
    } catch (transitionError) {
      console.error("Unable to update failed recovery incident:", transitionError.message);
    }
  }
}

// Detection only: no automatic recovery and no automatic closure of degraded incidents.
async function monitorOnce() {
  const orders = await Order.find({
    "tracking.simulationActive": true,
    status: { $ne: "Delivered" },
  });

  for (const order of orders) {
    const orderId = String(order._id);

    if (recoveriesInProgress.has(orderId) || sim.wasRecentlyStopped(orderId)) {
      continue;
    }

    const open = await findOpenIncident(order._id, STALE_TYPE);
    if (open) continue;

    const worker = sim.getWorker(orderId);

    if (worker && Date.now() - worker.startedAt < sim.STALE_AFTER_MS) {
      continue;
    }

    const confirmedAt = lastConfirmedAt(order);
    const ageMs = confirmedAt ? Date.now() - new Date(confirmedAt).getTime() : Infinity;
    const workerMissing = !worker;

    if (ageMs <= sim.STALE_AFTER_MS && !workerMissing) {
      continue;
    }

    const evidence = collectEvidence(order);
    const faultStartedAt = confirmedAt
      ? new Date(new Date(confirmedAt).getTime() + sim.UPDATE_INTERVAL_MS)
      : new Date();
    const label = chaosLabel(orderId);

    await openIncident({
      incidentType: STALE_TYPE,
      service: "rider-tracking",
      severity: "high",
      orderId: order._id,
      faultStartedAt: faultStartedAt > new Date() ? new Date() : faultStartedAt,
      diagnosis: workerMissing
        ? "Tracking worker missing for an active delivery"
        : `Rider location stale for ${Math.round(ageMs / 1000)}s (threshold ${sim.STALE_AFTER_MS / 1000}s)`,
      evidence,
      ...label,
    });
  }
}

function startMonitor() {
  if (monitorState.timer) return;

  let running = false;
  monitorState.timer = setInterval(async () => {
    if (running) return;
    running = true;

    try {
      await monitorOnce();
      monitorState.lastError = null;
    } catch (error) {
      monitorState.lastError = error.message;
      console.error("Tracking monitor error:", error.message);
    } finally {
      monitorState.lastRunAt = Date.now();
      monitorState.checksRun += 1;
      running = false;
    }
  }, MONITOR_INTERVAL_MS);
}

function getMonitorStatus() {
  const lastRunAgeMs = monitorState.lastRunAt
    ? Date.now() - monitorState.lastRunAt
    : null;

  return {
    running:
      Boolean(monitorState.timer) &&
      lastRunAgeMs !== null &&
      lastRunAgeMs < MONITOR_INTERVAL_MS * 5,
    intervalMs: MONITOR_INTERVAL_MS,
    lastRunAt: monitorState.lastRunAt
      ? new Date(monitorState.lastRunAt).toISOString()
      : null,
    lastError: monitorState.lastError,
    checksRun: monitorState.checksRun,
    recoveriesInProgress: [...recoveriesInProgress],
    staleAfterMs: sim.STALE_AFTER_MS,
  };
}

// ---------------------------------------------------------------------------
// Location updates submitted by a rider device
// ---------------------------------------------------------------------------

function describeInvalid(body) {
  const lat = body?.latitude;
  const lng = body?.longitude;

  if (
    lat === undefined || lng === undefined ||
    lat === null || lng === null || lat === "" || lng === ""
  ) {
    return "latitude and longitude are required";
  }

  if (typeof lat !== "number" || typeof lng !== "number") {
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return "coordinates must be numeric";
    }
  }

  const latitude = Number(lat);
  const longitude = Number(lng);

  if (latitude < -90 || latitude > 90) {
    return `latitude ${latitude} is outside -90..90`;
  }
  if (longitude < -180 || longitude > 180) {
    return `longitude ${longitude} is outside -180..180`;
  }

  return null;
}

async function recordInvalidData(order, payload, reason, { runId = null } = {}) {
  const before = {
    latitude: order.location?.latitude,
    longitude: order.location?.longitude,
    routeProgress: order.routeProgress || 0,
  };
  const rejected = { payload, reason, at: new Date().toISOString() };

  const recent = await Incident.findOne({
    orderId: order._id,
    incidentType: INVALID_TYPE,
    detectedAt: { $gte: new Date(Date.now() - INVALID_DATA_DEDUP_MS) },
  }).sort({ detectedAt: -1 });

  if (recent) {
    const list = Array.isArray(recent.evidence?.rejectedUpdates)
      ? recent.evidence.rejectedUpdates
      : [];

    await Incident.updateOne(
      { _id: recent._id },
      { $set: { "evidence.rejectedUpdates": [...list, rejected].slice(-20) } }
    );

    return { incidentId: recent._id, deduplicated: true };
  }

  const incident = await openIncident({
    incidentType: INVALID_TYPE,
    service: "rider-tracking",
    severity: "medium",
    orderId: order._id,
    source: runId ? "chaos_lab" : "monitor",
    scenario: runId ? "invalid_tracking_data" : null,
    runId,
    diagnosis: `Invalid location update rejected: ${reason}`,
    evidence: { rejectedUpdates: [rejected], locationBefore: before },
  });

  await transition(incident._id, "diagnosing", {
    note: "Classifying rejected payload",
    rootCause:
      `Malformed or out-of-range coordinates from the rider device (${reason}). ` +
      "Validation is a non-retryable error.",
  });

  await transition(incident._id, "recovering", {
    note: "Protective action",
    action: {
      name: "reject_and_preserve_last_valid",
      ok: true,
      detail:
        "Update rejected with HTTP 400; the last valid location, status and route progress were kept.",
    },
  });

  await transition(incident._id, "verifying", {
    note: "Re-reading stored order",
  });

  const stored = await Order.findById(order._id).lean();
  const storedValid = stored && hasValidLocation(stored);
  const progressKept = stored && (stored.routeProgress || 0) >= before.routeProgress;
  const notOverwritten =
    stored &&
    !(String(stored.location.latitude) === String(payload?.latitude) &&
      String(stored.location.longitude) === String(payload?.longitude));

  if (storedValid && progressKept && notOverwritten) {
    await transition(incident._id, "recovered", {
      note: "Stored tracking data verified intact",
      verification: {
        passed: true,
        detail:
          `Stored location (${stored.location.latitude.toFixed(5)}, ${stored.location.longitude.toFixed(5)}) is valid; ` +
          `progress ${stored.routeProgress || 0} >= ${before.routeProgress}; status ${stored.status}.`,
      },
      evidence: {
        locationAfter: {
          latitude: stored.location.latitude,
          longitude: stored.location.longitude,
          routeProgress: stored.routeProgress,
        },
      },
    });
  } else {
    await transition(incident._id, "failed", {
      note: "Stored data did not match the protected state",
      verification: {
        passed: false,
        detail: JSON.stringify({ storedValid, progressKept, notOverwritten }),
      },
    });
  }

  return { incidentId: incident._id, deduplicated: false };
}

async function applyLocationUpdate(orderId, body, { runId = null } = {}) {
  const order = await Order.findById(orderId);

  if (!order) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }

  const reason = describeInvalid(body);

  if (reason) {
    const result = await recordInvalidData(
      order,
      { latitude: body?.latitude, longitude: body?.longitude },
      reason,
      { runId }
    );

    const error = new Error(
      `Location update rejected: ${reason}. Last valid location kept.`
    );
    error.statusCode = 400;
    error.incidentId = result.incidentId;
    throw error;
  }

  await sim.writeConfirmedLocation(order, {
    latitude: Number(body.latitude),
    longitude: Number(body.longitude),
  });

  return order;
}

async function getTrackingState(order) {
  const worker = sim.getWorker(order._id);
  const confirmedAt = lastConfirmedAt(order);
  const ageMs = confirmedAt ? Date.now() - new Date(confirmedAt).getTime() : null;

  const incident = await Incident.findOne({
    orderId: order._id,
    incidentType: STALE_TYPE,
  })
    .sort({ detectedAt: -1 })
    .select("status detectedAt recoveredAt diagnosis rootCause recoveryAction retryCount timeline")
    .lean();

  let state;

  if (order.status === "Delivered") state = "DELIVERED";
  else if (!hasValidLocation(order)) state = "UNAVAILABLE";
  else if (incident && IN_PROGRESS_STATUSES.includes(incident.status)) state = "RECONNECTING";
  else if (!worker && !order.tracking?.simulationActive) state = "PAUSED";
  else if (
    incident?.status === "degraded" ||
    ageMs === null ||
    ageMs > sim.STALE_AFTER_MS
  ) state = "STALE";
  else if (
    incident?.status === "recovered" &&
    Date.now() - new Date(incident.recoveredAt).getTime() < RECENTLY_RECOVERED_MS
  ) state = "RECOVERED";
  else state = "LIVE";

  const showIncident =
    incident &&
    (OPEN_STATUSES.includes(incident.status) ||
      (incident.recoveredAt &&
        Date.now() - new Date(incident.recoveredAt).getTime() < RECENTLY_RECOVERED_MS * 2));

  return {
    state,
    lastSuccessfulLocationAt: confirmedAt,
    locationAgeMs: ageMs,
    staleAfterMs: sim.STALE_AFTER_MS,
    workerRunning: Boolean(worker),
    lastError: order.tracking?.lastError || null,
    lastErrorAt: order.tracking?.lastErrorAt || null,
    consecutiveFailures: order.tracking?.consecutiveFailures || 0,
    incident: showIncident
      ? {
          id: incident._id,
          status: incident.status,
          diagnosis: incident.rootCause || incident.diagnosis,
          recoveryAction: incident.recoveryAction,
          retryCount: incident.retryCount,
          detectedAt: incident.detectedAt,
          recoveredAt: incident.recoveredAt,
        }
      : null,
  };
}

async function recoverTrackingManually(incidentId) {
  if (Incident.db?.readyState !== 1) {
    const error = new Error("Database connection is unavailable.");
    error.statusCode = 503;
    throw error;
  }

  const incident = await Incident.findById(incidentId);

  if (!incident) {
    const error = new Error("Incident not found.");
    error.statusCode = 404;
    throw error;
  }

  if (incident.incidentType !== STALE_TYPE) {
    const error = new Error(
      "Manual recovery is currently supported only for rider tracking incidents."
    );
    error.statusCode = 400;
    throw error;
  }

  if (incident.status === "recovered") {
    const error = new Error("This incident is already recovered.");
    error.statusCode = 409;
    throw error;
  }

  if (IN_PROGRESS_STATUSES.includes(incident.status)) {
    const error = new Error("Recovery is already in progress for this incident.");
    error.statusCode = 409;
    throw error;
  }

  if (!["detected", "degraded", "failed"].includes(incident.status)) {
    const error = new Error(
      `Manual recovery is not allowed for incident status: ${incident.status}`
    );
    error.statusCode = 409;
    throw error;
  }

  if (!incident.orderId) {
    const error = new Error("This incident is not linked to an order.");
    error.statusCode = 400;
    throw error;
  }

  const orderId = String(incident.orderId);

  if (recoveriesInProgress.has(orderId)) {
    const error = new Error("Another recovery is already running for this order.");
    error.statusCode = 409;
    throw error;
  }

  const order = await Order.findById(orderId);

  if (!order) {
    const error = new Error("The linked order no longer exists.");
    error.statusCode = 404;
    throw error;
  }

  if (order.status === "Delivered" || !order.tracking?.simulationActive) {
    const error = new Error(
      "Tracking is stopped or the order is delivered. Recovery cannot continue."
    );
    error.statusCode = 409;
    throw error;
  }

  // Acquire the lock before changing the fault or incident.
  recoveriesInProgress.add(orderId);

  try {
    if (incident.source === "chaos_lab") {
      clearTrackingFault(orderId);
    }

    await recoverTracking(incident._id, orderId);
  } finally {
    recoveriesInProgress.delete(orderId);
  }

  const updatedIncident = await Incident.findById(incident._id).lean();

  if (updatedIncident?.status !== "recovered") {
    const error = new Error(
      updatedIncident?.timeline?.slice(-1)[0]?.note ||
        "Recovery could not be verified. The incident remains unresolved."
    );
    error.statusCode = 422;
    error.incident = updatedIncident;
    throw error;
  }

  return updatedIncident;
}

module.exports = {
  STALE_TYPE,
  INVALID_TYPE,
  startMonitor,
  getMonitorStatus,
  applyLocationUpdate,
  getTrackingState,
  collectEvidence,
  recoverTrackingManually,
};
