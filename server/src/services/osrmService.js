
// const Incident = require("../models/Incident");

// const OSRM_BASE_URL =
//   process.env.OSRM_BASE_URL ||
//   "https://router.project-osrm.org";

// const MAX_ATTEMPTS = 3;
// const REQUEST_TIMEOUT_MS = 8000;
// const COOLDOWN_MS = 10000;

// const routingState = {
//   circuitState: "CLOSED",
//   consecutiveFailures: 0,
//   circuitOpenedAt: null,
//   probeInProgress: false,
//   failureMode: "off",
//   failOnceConsumed: false,
//   lastKnownRoutes: new Map(),
// };

// const activeRoutingIncidents = new Map();

// const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// function getCircuitStatus() {
//   const elapsed = routingState.circuitOpenedAt
//     ? Date.now() - routingState.circuitOpenedAt
//     : 0;

//   return {
//     circuitState: routingState.circuitState,
//     consecutiveFailures: routingState.consecutiveFailures,
//     failureMode: routingState.failureMode,
//     probeInProgress: routingState.probeInProgress,
//     cooldownRemainingMs:
//       routingState.circuitState === "OPEN"
//         ? Math.max(0, COOLDOWN_MS - elapsed)
//         : 0,
//   };
// }

// function configureRoutingChaos(failureMode) {
//   if (!["off", "once", "always"].includes(failureMode)) {
//     throw new Error("failureMode must be off, once, or always");
//   }

//   routingState.failureMode = failureMode;
//   routingState.failOnceConsumed = false;
//   routingState.consecutiveFailures = 0;
//   routingState.circuitState = "CLOSED";
//   routingState.circuitOpenedAt = null;
//   routingState.probeInProgress = false;

//   return getCircuitStatus();
// }

// function validateCoordinates(point, label) {
//   if (
//     !point ||
//     !Number.isFinite(Number(point.longitude)) ||
//     !Number.isFinite(Number(point.latitude)) ||
//     Number(point.longitude) < -180 ||
//     Number(point.longitude) > 180 ||
//     Number(point.latitude) < -90 ||
//     Number(point.latitude) > 90
//   ) {
//     throw new Error(`Invalid ${label} coordinates`);
//   }
// }

// async function requestOsrmRoute(origin, destination) {
//   if (routingState.failureMode === "always") {
//     throw new Error("Chaos Lab: simulated OSRM outage");
//   }

//   if (
//     routingState.failureMode === "once" &&
//     !routingState.failOnceConsumed
//   ) {
//     routingState.failOnceConsumed = true;
//     throw new Error("Chaos Lab: simulated temporary OSRM failure");
//   }

//   const coordinates = [
//     `${origin.longitude},${origin.latitude}`,
//     `${destination.longitude},${destination.latitude}`,
//   ].join(";");

//   const url =
//     `${OSRM_BASE_URL}/route/v1/driving/${coordinates}` +
//     "?overview=full&geometries=geojson&steps=true";

//   const controller = new AbortController();
//   const timeout = setTimeout(
//     () => controller.abort(),
//     REQUEST_TIMEOUT_MS
//   );

//   try {
//     const response = await fetch(url, {
//       signal: controller.signal,
//       headers: { Accept: "application/json" },
//     });

//     if (!response.ok) {
//       throw new Error(`OSRM HTTP error: ${response.status}`);
//     }

//     const data = await response.json();

//     if (
//       data.code !== "Ok" ||
//       !Array.isArray(data.routes) ||
//       !data.routes[0]?.geometry?.coordinates?.length
//     ) {
//       throw new Error(
//         `OSRM returned no route: ${data.code || "unknown error"}`
//       );
//     }

//     const route = data.routes[0];

//     return {
//       source: "osrm",
//       routeName: "OSRM road route",
//       coordinates: route.geometry.coordinates,
//       distanceMeters: route.distance,
//       durationSeconds: route.duration,
//       steps: (route.legs || []).flatMap((leg) =>
//         (leg.steps || []).map((step) => ({
//           instruction: step.maneuver?.type || "continue",
//           roadName: step.name || "",
//           distanceMeters: step.distance,
//           durationSeconds: step.duration,
//           location: step.maneuver?.location || null,
//         }))
//       ),
//       fetchedAt: new Date().toISOString(),
//     };
//   } finally {
//     clearTimeout(timeout);
//   }
// }

// async function saveRoutingIncident({
//   status,
//   startedAt,
//   message,
//   cacheKey,
// }) {
//   try {
//     const now = new Date();
//     let incidentId = activeRoutingIncidents.get(cacheKey);

//     let existing = incidentId
//       ? await Incident.findById(incidentId)
//       : null;

//     if (
//       !existing ||
//       !["detected", "diagnosing", "recovering"].includes(existing.status)
//     ) {
//       activeRoutingIncidents.delete(cacheKey);

//       existing = await Incident.findOne({
//         incidentType: "external_route_service_failure",
//         service: "osrm-routing-service",
//         routeKey: cacheKey,
//         status: { $in: ["detected", "diagnosing", "recovering"] },
//       }).sort({ detectedAt: -1 });

//       if (existing) {
//         activeRoutingIncidents.set(cacheKey, existing._id);
//       }
//     }

//     const update = {
//       status,
//       diagnosis: message,
//       recoveryAction:
//         status === "recovered"
//           ? "Live OSRM route verified successfully."
//           : status === "recovering"
//             ? "Cached route served; external routing recovery is not confirmed."
//             : "OSRM failed and no usable cached route is available.",
//     };

//     if (status === "recovered") {
//       update.recoveredAt = now;
//       update.recoveryTimeMs = Date.now() - startedAt;
//     }

//     if (existing) {
//       const updated = await Incident.findByIdAndUpdate(
//         existing._id,
//         { $set: update },
//         { new: true }
//       );

//       if (["recovered", "failed"].includes(status)) {
//         activeRoutingIncidents.delete(cacheKey);
//       }

//       return updated;
//     }

//     const incident = await Incident.create({
//       incidentType: "external_route_service_failure",
//       service: "osrm-routing-service",
//       severity: "medium",
//       status,
//       diagnosis: message,
//       recoveryAction: update.recoveryAction,
//       source: "system",
//       detectedAt: new Date(startedAt),
//       detectionTimeMs: Date.now() - startedAt,
//       recoveredAt: status === "recovered" ? now : null,
//       recoveryTimeMs:
//         status === "recovered" ? Date.now() - startedAt : null,
//       routeKey: cacheKey,
//     });

//     if (["detected", "diagnosing", "recovering"].includes(status)) {
//       activeRoutingIncidents.set(cacheKey, incident._id);
//     }

//     return incident;
//   } catch (error) {
//     console.error("Unable to save routing incident:", error.message);
//     return null;
//   }
// }

// async function getRoadRouteWithHealing(origin, destination) {
//   validateCoordinates(origin, "origin");
//   validateCoordinates(destination, "destination");

//   const startedAt = Date.now();

//   const cacheKey = [
//     origin.longitude,
//     origin.latitude,
//     destination.longitude,
//     destination.latitude,
//   ].join(",");

//   const cachedRoute = routingState.lastKnownRoutes.get(cacheKey);

//   if (routingState.circuitState === "OPEN") {
//     const elapsed = Date.now() - routingState.circuitOpenedAt;

//     if (elapsed < COOLDOWN_MS) {
//       if (cachedRoute) {
//         await saveRoutingIncident({
//           status: "recovering",
//           startedAt,
//           message: "OSRM circuit OPEN; cached route is being served.",
//           cacheKey,
//         });

//         return {
//           ...cachedRoute,
//           source: "cache",
//           degraded: true,
//           attempts: 0,
//           recoveryTimeMs: Date.now() - startedAt,
//           message: "Circuit OPEN; serving cached road route.",
//         };
//       }

//       const error = new Error(
//         "Routing circuit is OPEN and no cached route exists."
//       );
//       error.statusCode = 503;
//       error.reliability = getCircuitStatus();
//       throw error;
//     }

//     routingState.circuitState = "HALF_OPEN";
//   }

//   const isProbe = routingState.circuitState === "HALF_OPEN";

//   if (isProbe && routingState.probeInProgress) {
//     if (cachedRoute) {
//       return {
//         ...cachedRoute,
//         source: "cache",
//         degraded: true,
//         attempts: 0,
//         recoveryTimeMs: Date.now() - startedAt,
//         message: "Recovery probe in progress; cached route served.",
//       };
//     }

//     const error = new Error("Routing recovery probe is already running.");
//     error.statusCode = 503;
//     throw error;
//   }

//   if (isProbe) {
//     routingState.probeInProgress = true;
//   }

//   const maxAttempts = isProbe ? 1 : MAX_ATTEMPTS;
//   let attempts = 0;
//   let lastError;

//   try {
//     for (let attempt = 1; attempt <= maxAttempts; attempt++) {
//       attempts++;

//       try {
//         const route = await requestOsrmRoute(origin, destination);

//         routingState.consecutiveFailures = 0;
//         routingState.circuitState = "CLOSED";
//         routingState.circuitOpenedAt = null;
//         routingState.lastKnownRoutes.set(cacheKey, route);

//         // Resolve only an incident associated with this route.
//         if (activeRoutingIncidents.has(cacheKey) || isProbe) {
//           await saveRoutingIncident({
//             status: "recovered",
//             startedAt,
//             message: "OSRM route request recovered successfully.",
//             cacheKey,
//           });
//         }

//         return {
//           ...route,
//           degraded: false,
//           attempts,
//           recoveryTimeMs: Date.now() - startedAt,
//           message:
//             attempt > 1
//               ? "OSRM recovered after retry."
//               : "Live OSRM route retrieved successfully.",
//         };
//       } catch (error) {
//         lastError = error;
//         routingState.consecutiveFailures++;

//         if (
//           isProbe ||
//           routingState.consecutiveFailures >= MAX_ATTEMPTS
//         ) {
//           routingState.circuitState = "OPEN";
//           routingState.circuitOpenedAt = Date.now();
//           break;
//         }

//         if (attempt < maxAttempts) {
//           await sleep(200 * 2 ** (attempt - 1));
//         }
//       }
//     }

//     const incidentStatus = cachedRoute ? "recovering" : "failed";

//     await saveRoutingIncident({
//       status: incidentStatus,
//       startedAt,
//       message: lastError?.message || "OSRM route request failed.",
//       cacheKey,
//     });

//     if (cachedRoute) {
//       return {
//         ...cachedRoute,
//         source: "cache",
//         degraded: true,
//         attempts,
//         recoveryTimeMs: Date.now() - startedAt,
//         message: "OSRM unavailable; returning the last-known route.",
//       };
//     }

//     const error = new Error(
//       "OSRM is unavailable and no cached route exists for this destination."
//     );
//     error.statusCode = 503;
//     error.attempts = attempts;
//     error.reliability = getCircuitStatus();
//     throw error;
//   } finally {
//     if (isProbe) {
//       routingState.probeInProgress = false;
//     }
//   }
// }

// module.exports = {
//   getRoadRouteWithHealing,
//   configureRoutingChaos,
//   getCircuitStatus,
// };


const Incident = require("../models/Incident");
const { openIncident, transition, OPEN_STATUSES } = require("./incidentLifecycle");

const OSRM_BASE_URL =
  process.env.OSRM_BASE_URL || "https://router.project-osrm.org";

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 8000;
const COOLDOWN_MS = 10000;
const MAX_CACHED_ROUTES = 200;

const routingState = {
  circuitState: "CLOSED",
  consecutiveFailures: 0,
  circuitOpenedAt: null,
  probeInProgress: false,
  failureMode: "off",
  failOnceConsumed: false,
  chaosRunId: null,
  chaosExpiresAt: null,
  lastProbe: null,
  lastKnownRoutes: new Map(),
};

const activeRoutingIncidents = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getCircuitStatus() {
  const elapsed = routingState.circuitOpenedAt
    ? Date.now() - routingState.circuitOpenedAt
    : 0;

  return {
    circuitState: routingState.circuitState,
    consecutiveFailures: routingState.consecutiveFailures,
    failureMode: routingState.failureMode,
    chaosExpiresInMs: routingState.chaosExpiresAt
      ? Math.max(0, routingState.chaosExpiresAt - Date.now())
      : null,
    probeInProgress: routingState.probeInProgress,
    cooldownMs: COOLDOWN_MS,
    cooldownRemainingMs:
      routingState.circuitState === "OPEN"
        ? Math.max(0, COOLDOWN_MS - elapsed)
        : 0,
    cachedRouteCount: routingState.lastKnownRoutes.size,
    lastProbe: routingState.lastProbe,
  };
}

// Test-only routing fault. Every "always" outage is bounded: it switches
// itself off after durationMs (default 30s, max 60s).
let chaosTimer = null;

function configureRoutingChaos(failureMode, { durationMs = 30000, runId = null } = {}) {
  if (!["off", "once", "always"].includes(failureMode)) {
    throw new Error("failureMode must be off, once, or always");
  }

  clearTimeout(chaosTimer);
  chaosTimer = null;

  routingState.failureMode = failureMode;
  routingState.failOnceConsumed = false;
  routingState.chaosRunId = failureMode === "off" ? null : runId;
  routingState.chaosExpiresAt = null;

  // An OPEN circuit is not reset here; switching chaos off lets the normal
  // half-open probe verify recovery.
  if (failureMode === "always") {
    const bounded = Math.min(Math.max(Number(durationMs) || 30000, 1000), 60000);
    routingState.chaosExpiresAt = Date.now() + bounded;
    chaosTimer = setTimeout(() => {
      routingState.failureMode = "off";
      routingState.chaosRunId = null;
      routingState.chaosExpiresAt = null;
    }, bounded);
    chaosTimer.unref?.();
  }

  return getCircuitStatus();
}

function validateCoordinates(point, label) {
  const longitude = Number(point?.longitude);
  const latitude = Number(point?.latitude);

  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new Error(`Invalid ${label} coordinates`);
  }
}

function makeCacheKey(origin, destination) {
  return [
    Number(origin.longitude),
    Number(origin.latitude),
    Number(destination.longitude),
    Number(destination.latitude),
  ].join(",");
}

function cacheRoute(cacheKey, route) {
  // Refresh insertion order so the oldest entry can be evicted.
  routingState.lastKnownRoutes.delete(cacheKey);
  routingState.lastKnownRoutes.set(cacheKey, route);

  if (routingState.lastKnownRoutes.size > MAX_CACHED_ROUTES) {
    const oldestKey = routingState.lastKnownRoutes.keys().next().value;
    routingState.lastKnownRoutes.delete(oldestKey);
  }
}

async function requestOsrmRoute(origin, destination) {
  if (routingState.failureMode === "always") {
    throw new Error("Chaos Lab: simulated OSRM outage");
  }

  if (
    routingState.failureMode === "once" &&
    !routingState.failOnceConsumed
  ) {
    routingState.failOnceConsumed = true;
    throw new Error("Chaos Lab: simulated temporary OSRM failure");
  }

  const coordinates = [
    `${Number(origin.longitude)},${Number(origin.latitude)}`,
    `${Number(destination.longitude)},${Number(destination.latitude)}`,
  ].join(";");

  const url =
    `${OSRM_BASE_URL}/route/v1/driving/${coordinates}` +
    "?overview=full&geometries=geojson&steps=true";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`OSRM HTTP error: ${response.status}`);
    }

    const data = await response.json();
    const route = data.routes?.[0];
    const coordinates = route?.geometry?.coordinates;

    if (
      data.code !== "Ok" ||
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !Number.isFinite(route.distance) ||
      !Number.isFinite(route.duration)
    ) {
      throw new Error(
        `OSRM returned no valid route: ${data.code || "unknown error"}`
      );
    }

    return {
      source: "osrm",
      routeName: "OSRM road route",
      coordinates,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      steps: (route.legs || []).flatMap((leg) =>
        (leg.steps || []).map((step) => ({
          instruction: step.maneuver?.type || "continue",
          roadName: step.name || "",
          distanceMeters: step.distance,
          durationSeconds: step.duration,
          location: step.maneuver?.location || null,
        }))
      ),
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`OSRM request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Routing errors are classified from the observed error message.
function classifyRoutingError(message = "") {
  if (/Chaos Lab/i.test(message)) {
    return "Routing dependency outage (injected by Chaos Lab test wrapper; real OSRM not contacted).";
  }
  if (/timed out/i.test(message)) return "OSRM did not respond within the request timeout.";
  if (/HTTP error: 5\d\d/.test(message)) return "OSRM upstream returned a server error (service unavailable).";
  if (/HTTP error: 4\d\d/.test(message)) return "OSRM rejected the request (client error).";
  if (/no valid route/i.test(message)) return "OSRM returned an invalid or empty route response.";
  return `Routing request failed: ${message}`;
}

async function findActiveIncident(cacheKey) {
  const savedId = activeRoutingIncidents.get(cacheKey);

  if (savedId) {
    const savedIncident = await Incident.findById(savedId);
    if (savedIncident && OPEN_STATUSES.includes(savedIncident.status)) {
      return savedIncident;
    }
    activeRoutingIncidents.delete(cacheKey);
  }

  const incident = await Incident.findOne({
    incidentType: "external_route_service_failure",
    service: "osrm-routing-service",
    routeKey: cacheKey,
    status: { $in: OPEN_STATUSES },
  }).sort({ detectedAt: -1 });

  if (incident) activeRoutingIncidents.set(cacheKey, incident._id);
  return incident;
}

// Records one routing event against a single incident per route key.
// event: "failure" | "fallback" | "no_cache" | "recovered"
async function recordRoutingEvent(event, { cacheKey, startedAt, error, attempts, route }) {
  try {
    let incident = await findActiveIncident(cacheKey);

    if (event === "recovered") {
      if (!incident) return null;
      const valid =
        Array.isArray(route?.coordinates) &&
        route.coordinates.length >= 2 &&
        Number.isFinite(route.distanceMeters);
      await transition(incident._id, "verifying", {
        note: "Live OSRM response received; validating route",
      });
      const updated = await transition(incident._id, valid ? "recovered" : "degraded", {
        note: valid ? "Live routing verified; circuit CLOSED" : "Live response failed validation",
        action: {
          name: "half_open_probe",
          ok: valid,
          detail: valid
            ? "Live OSRM route verified; circuit returned to CLOSED."
            : "Live OSRM response did not contain a valid route.",
        },
        verification: {
          passed: valid,
          detail: valid
            ? `Live route with ${route.coordinates.length} points, ${Math.round(route.distanceMeters)} m, fetched ${route.fetchedAt}.`
            : "Route validation failed.",
        },
      });
      activeRoutingIncidents.delete(cacheKey);
      return updated;
    }

    if (!incident) {
      incident = await openIncident({
        incidentType: "external_route_service_failure",
        service: "osrm-routing-service",
        severity: "medium",
        source: routingState.chaosRunId ? "chaos_lab" : "monitor",
        scenario: routingState.chaosRunId ? "osrm_outage" : null,
        runId: routingState.chaosRunId,
        routeKey: cacheKey,
        faultStartedAt: new Date(startedAt),
        diagnosis: error?.message || "Routing request failed",
        evidence: { firstError: error?.message || null },
      });
      activeRoutingIncidents.set(cacheKey, incident._id);
      await transition(incident._id, "diagnosing", {
        note: "Classifying routing error",
        rootCause: classifyRoutingError(error?.message),
      });
    }

    if (event === "failure") {
      return transition(incident._id, "recovering", {
        note: "Retrying with exponential backoff",
        retry: incident.status === "recovering",
        evidence: { lastError: error?.message || null, circuit: getCircuitStatus() },
        action: {
          name: "retry_with_backoff",
          ok: false,
          detail: `Routing attempt failed: ${error?.message}`,
        },
      });
    }

    if (event === "fallback") {
      return transition(incident._id, "degraded", {
        note: "Serving last-known cached route",
        evidence: { lastError: error?.message || null, attempts, circuit: getCircuitStatus() },
        action: {
          name: "serve_cached_route",
          ok: true,
          detail: "Last-known road route served as a degraded fallback; live routing not yet verified.",
        },
      });
    }

    if (event === "no_cache") {
      const updated = await transition(incident._id, "failed", {
        note: "No fallback available",
        evidence: { lastError: error?.message || null, attempts, circuit: getCircuitStatus() },
        action: {
          name: "no_fallback",
          ok: false,
          detail: "No route could be served. Retry after the routing service recovers.",
        },
      });
      activeRoutingIncidents.delete(cacheKey);
      return updated;
    }

    return incident;
  } catch (persistError) {
    // Incident persistence should not hide the routing result.
    console.error("Unable to save routing incident:", persistError.message);
    return null;
  }
}

function makeFallback(cachedRoute, attempts, startedAt, message) {
  return {
    ...cachedRoute,
    source: "cache",
    degraded: true,
    attempts,
    recoveryTimeMs: Math.max(0, Date.now() - startedAt),
    message,
    circuit: getCircuitStatus(),
  };
}

async function getRoadRouteWithHealing(origin, destination) {
  validateCoordinates(origin, "origin");
  validateCoordinates(destination, "destination");

  const startedAt = Date.now();
  const cacheKey = makeCacheKey(origin, destination);
  const cachedRoute = routingState.lastKnownRoutes.get(cacheKey);

  if (routingState.circuitState === "OPEN") {
    const elapsed = Date.now() - routingState.circuitOpenedAt;

    if (elapsed < COOLDOWN_MS) {
      if (cachedRoute) {
        await recordRoutingEvent("fallback", {
          cacheKey,
          startedAt,
          attempts: 0,
          error: { message: "Circuit OPEN; external request skipped" },
        });
        return makeFallback(
          cachedRoute,
          0,
          startedAt,
          "Circuit OPEN; serving cached road route."
        );
      }

      const error = new Error(
        "Routing circuit is OPEN and no cached route exists for this destination."
      );
      error.statusCode = 503;
      error.reliability = getCircuitStatus();
      throw error;
    }

    routingState.circuitState = "HALF_OPEN";
  }

  const isProbe = routingState.circuitState === "HALF_OPEN";

  if (isProbe && routingState.probeInProgress) {
    if (cachedRoute) {
      return makeFallback(
        cachedRoute,
        0,
        startedAt,
        "Recovery probe is in progress; serving the last-known route."
      );
    }

    const error = new Error("Routing recovery probe is already running.");
    error.statusCode = 503;
    error.reliability = getCircuitStatus();
    throw error;
  }

  if (isProbe) routingState.probeInProgress = true;

  const maxAttempts = isProbe ? 1 : MAX_ATTEMPTS;
  let attempts = 0;
  let lastError;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attempts++;

      try {
        const route = await requestOsrmRoute(origin, destination);

        routingState.consecutiveFailures = 0;
        routingState.circuitState = "CLOSED";
        routingState.circuitOpenedAt = null;
        if (isProbe) routingState.lastProbe = { at: new Date().toISOString(), ok: true };
        cacheRoute(cacheKey, route);

        await recordRoutingEvent("recovered", { cacheKey, startedAt, route });

        return {
          ...route,
          degraded: false,
          attempts,
          recoveryTimeMs: Math.max(0, Date.now() - startedAt),
          message: isProbe
            ? "Recovery probe succeeded; circuit CLOSED."
            : attempts > 1
              ? "OSRM recovered after retry."
              : "Live OSRM route retrieved successfully.",
          circuit: getCircuitStatus(),
        };
      } catch (error) {
        lastError = error;
        routingState.consecutiveFailures++;
        if (isProbe) {
          routingState.lastProbe = { at: new Date().toISOString(), ok: false, error: error.message };
        }

        if (isProbe || routingState.consecutiveFailures >= MAX_ATTEMPTS) {
          routingState.circuitState = "OPEN";
          routingState.circuitOpenedAt = Date.now();
        }

        await recordRoutingEvent("failure", { cacheKey, startedAt, error, attempts });

        if (routingState.circuitState === "OPEN") break;

        if (attempt < maxAttempts) {
          await sleep(250 * 2 ** (attempt - 1));
        }
      }
    }

    if (cachedRoute) {
      await recordRoutingEvent("fallback", { cacheKey, startedAt, error: lastError, attempts });
      return makeFallback(
        cachedRoute,
        attempts,
        startedAt,
        "OSRM unavailable; returning the last-known road route. Live recovery is not confirmed."
      );
    }

    await recordRoutingEvent("no_cache", { cacheKey, startedAt, error: lastError, attempts });

    const error = new Error(
      "OSRM is unavailable and no cached route exists for this destination."
    );
    error.statusCode = 503;
    error.attempts = attempts;
    error.reliability = getCircuitStatus();
    throw error;
  } finally {
    if (isProbe) routingState.probeInProgress = false;
  }
}

module.exports = {
  getRoadRouteWithHealing,
  configureRoutingChaos,
  getCircuitStatus,
  makeCacheKey,
};
