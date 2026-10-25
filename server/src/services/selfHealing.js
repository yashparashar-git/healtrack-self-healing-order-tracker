
// const Incident = require("../models/Incident");

// const COOLDOWN_MS = 10000;

// const state = {
//   failureMode: "off",
//   failOnceConsumed: false,
//   consecutiveFailures: 0,
//   circuitState: "CLOSED",
//   circuitOpenedAt: null,
//   probeInProgress: false,
//   lastKnownRoute: {
//     source: "cached",
//     routeName: "Ajmer Delivery Hub to Destination",
//     coordinates: [
//       [74.6399, 26.4499],
//       [74.6500, 26.4600],
//       [74.6600, 26.4700],
//     ],
//   },
// };

// const sleep = (ms) =>
//   new Promise((resolve) => setTimeout(resolve, ms));

// async function simulatedExternalService() {
//   if (state.failureMode === "always") {
//     throw new Error("Simulated external routing service timeout");
//   }

//   if (state.failureMode === "once" && !state.failOnceConsumed) {
//     state.failOnceConsumed = true;
//     throw new Error("Simulated temporary routing service failure");
//   }

//   return {
//     source: "live",
//     routeName: "Live routing service response",
//     coordinates: [
//       [74.6399, 26.4499],
//       [74.6450, 26.4550],
//       [74.6500, 26.4600],
//     ],
//   };
// }

// function getCircuitStatus() {
//   const elapsed = state.circuitOpenedAt
//     ? Date.now() - state.circuitOpenedAt
//     : 0;

//   return {
//     circuitState: state.circuitState,
//     failureMode: state.failureMode,
//     consecutiveFailures: state.consecutiveFailures,
//     probeInProgress: state.probeInProgress,
//     cooldownRemainingMs:
//       state.circuitState === "OPEN"
//         ? Math.max(0, COOLDOWN_MS - elapsed)
//         : 0,
//   };
// }

// function makeFallback(startedAt, attempts, message) {
//   return {
//     route: {
//       ...state.lastKnownRoute,
//       source: "cached",
//       routeName: "Last-known cached route",
//     },
//     source: "fallback",
//     message,
//     attempts,
//     recoveryTimeMs: Date.now() - startedAt,
//   };
// }

// async function getRouteWithHealing() {
//   const startedAt = Date.now();

//   // OPEN: no retries until cooldown expires.
//   if (state.circuitState === "OPEN") {
//     const elapsed = Date.now() - state.circuitOpenedAt;

//     if (elapsed < COOLDOWN_MS) {
//       return makeFallback(
//         startedAt,
//         0,
//         "Circuit is OPEN. Cached route served without external calls."
//       );
//     }

//     // Allow only one HALF_OPEN probe.
//     state.circuitState = "HALF_OPEN";
//   }

//   if (state.circuitState === "HALF_OPEN" && state.probeInProgress) {
//     return makeFallback(
//       startedAt,
//       0,
//       "Recovery probe already running. Cached route served."
//     );
//   }

//   const isProbe = state.circuitState === "HALF_OPEN";

//   if (isProbe) {
//     state.probeInProgress = true;
//   }

//   const maxAttempts = isProbe ? 1 : 3;
//   let attemptsMade = 0;
//   let lastError;

//   try {
//     for (let attempt = 1; attempt <= maxAttempts; attempt++) {
//       attemptsMade++;

//       try {
//         const route = await simulatedExternalService();

//         state.consecutiveFailures = 0;
//         state.circuitState = "CLOSED";
//         state.circuitOpenedAt = null;
//         state.lastKnownRoute = route;

//         return {
//           route,
//           source: "live",
//           message: isProbe
//             ? "Recovery probe succeeded. Circuit CLOSED."
//             : "Routing service responded successfully.",
//           attempts: attemptsMade,
//           recoveryTimeMs: Date.now() - startedAt,
//         };
//       } catch (error) {
//         lastError = error;
//         state.consecutiveFailures++;

//         if (isProbe || state.consecutiveFailures >= 3) {
//           state.circuitState = "OPEN";
//           state.circuitOpenedAt = Date.now();
//           break;
//         }

//         if (attempt < maxAttempts) {
//           await sleep(200 * 2 ** (attempt - 1));
//         }
//       }
//     }

//     return makeFallback(
//       startedAt,
//       attemptsMade,
//       `${lastError?.message || "Routing service unavailable"}. Serving cached route.`
//     );
//   } finally {
//     if (isProbe) {
//       state.probeInProgress = false;
//     }
//   }
// }

// async function recordRouteIncident(result) {
//   const recovered = result.source === "live";

//   try {
//     if (recovered) {
//       const existingIncident = await Incident.findOneAndUpdate(
//         {
//           incidentType: "external_route_service_failure",
//           service: "routing-service",
//           status: "recovering",
//         },
//         {
//           $set: {
//             status: "recovered",
//             diagnosis:
//               "External routing service recovered successfully.",
//             recoveryAction:
//               "Routing service responded successfully after recovery.",
//             recoveredAt: new Date(),
//             recoveryTimeMs: result.recoveryTimeMs,
//           },
//         },
//         {
//           new: true,
//           sort: { detectedAt: -1 },
//         }
//       );

//       return existingIncident;
//     }

//     return await Incident.create({
//       incidentType: "external_route_service_failure",
//       service: "routing-service",
//       severity: "medium",
//       status: "recovering",
//       diagnosis:
//         "External routing service failure detected during the Chaos Lab test.",
//       recoveryAction:
//         "Cached route served; external service recovery is not confirmed.",
//       source: "chaos_lab",
//       detectionTimeMs: result.recoveryTimeMs,
//       recoveredAt: null,
//       recoveryTimeMs: null,
//     });
//   } catch (error) {
//     console.error("Unable to save Chaos Lab incident:", error.message);
//     return null;
//   }
// }

// function resetChaos(mode) {
//   state.failureMode = mode;
//   state.failOnceConsumed = false;
//   state.consecutiveFailures = 0;
//   state.circuitState = "CLOSED";
//   state.circuitOpenedAt = null;
//   state.probeInProgress = false;
// }

// module.exports = {
//   state,
//   getRouteWithHealing,
//   recordRouteIncident,
//   getCircuitStatus,
//   resetChaos,
// };

const Incident = require("../models/Incident");

const COOLDOWN_MS = 10000;
const SERVICE_NAME = "routing-service";

const state = {
  failureMode: "off",
  failOnceConsumed: false,
  consecutiveFailures: 0,
  circuitState: "CLOSED",
  circuitOpenedAt: null,
  probeInProgress: false,
  activeIncidentId: null,
  lastKnownRoute: {
    source: "cached",
    routeName: "Ajmer Delivery Hub to Destination",
    coordinates: [
      [74.6399, 26.4499],
      [74.6500, 26.4600],
      [74.6600, 26.4700],
    ],
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function simulatedExternalService() {
  if (state.failureMode === "always") {
    throw new Error("Chaos Lab: simulated routing service outage");
  }

  if (state.failureMode === "once" && !state.failOnceConsumed) {
    state.failOnceConsumed = true;
    throw new Error("Chaos Lab: simulated temporary routing failure");
  }

  return {
    source: "live",
    routeName: "Live routing service response",
    coordinates: [
      [74.6399, 26.4499],
      [74.6450, 26.4550],
      [74.6500, 26.4600],
    ],
  };
}

function getCircuitStatus() {
  const elapsed = state.circuitOpenedAt
    ? Date.now() - state.circuitOpenedAt
    : 0;

  return {
    circuitState: state.circuitState,
    failureMode: state.failureMode,
    consecutiveFailures: state.consecutiveFailures,
    probeInProgress: state.probeInProgress,
    cooldownRemainingMs:
      state.circuitState === "OPEN"
        ? Math.max(0, COOLDOWN_MS - elapsed)
        : 0,
  };
}

async function saveIncident(status, message, result = {}) {
  try {
    let incident = state.activeIncidentId
      ? await Incident.findById(state.activeIncidentId)
      : null;

    if (
      !incident ||
      !["detected", "diagnosing", "recovering"].includes(incident.status)
    ) {
      state.activeIncidentId = null;

      incident = await Incident.findOne({
        incidentType: "external_route_service_failure",
        service: SERVICE_NAME,
        source: "chaos_lab",
        status: { $in: ["detected", "diagnosing", "recovering"] },
      }).sort({ detectedAt: -1 });

      if (incident) state.activeIncidentId = incident._id;
    }

    const now = new Date();
    const fields = {
      status,
      diagnosis: message,
      recoveryAction:
        status === "recovered"
          ? "Simulated routing service recovered; live response verified."
          : status === "recovering"
            ? "Cached route served while routing recovery remains unconfirmed."
            : "Simulated routing service failed without confirmed recovery.",
    };

    if (status === "recovered") {
      fields.recoveredAt = now;
      fields.recoveryTimeMs = result.recoveryTimeMs ?? null;
    }

    if (incident) {
      // const updated = await Incident.findByIdAndUpdate(
      //   incident._id,
      //   { $set: fields },
      //   { new: true }
      // );
      const updated = await Incident.findByIdAndUpdate(
  incident._id,
  { $set: fields },
  { returnDocument: "after" }
);

      if (["recovered", "failed"].includes(status)) {
        state.activeIncidentId = null;
      }

      return updated;
    }

    const created = await Incident.create({
      incidentType: "external_route_service_failure",
      service: SERVICE_NAME,
      severity: "medium",
      status,
      diagnosis: message,
      recoveryAction: fields.recoveryAction,
      source: "chaos_lab",
      detectedAt: new Date(Date.now() - (result.recoveryTimeMs || 0)),
      detectionTimeMs: result.recoveryTimeMs ?? 0,
      recoveredAt: status === "recovered" ? now : null,
      recoveryTimeMs:
        status === "recovered" ? result.recoveryTimeMs ?? null : null,
    });

    if (["detected", "diagnosing", "recovering"].includes(status)) {
      state.activeIncidentId = created._id;
    }

    return created;
  } catch (error) {
    console.error("Unable to save Chaos Lab incident:", error.message);
    return null;
  }
}

function makeFallback(startedAt, attempts, message) {
  return {
    route: {
      ...state.lastKnownRoute,
      source: "cached",
      routeName: "Last-known cached route",
    },
    source: "fallback",
    degraded: true,
    message,
    attempts,
    recoveryTimeMs: Date.now() - startedAt,
  };
}

async function getRouteWithHealing() {
  const startedAt = Date.now();

  if (state.circuitState === "OPEN") {
    const elapsed = Date.now() - state.circuitOpenedAt;

    if (elapsed < COOLDOWN_MS) {
      return makeFallback(
        startedAt,
        0,
        "Circuit OPEN; cached route served without an external request."
      );
    }

    state.circuitState = "HALF_OPEN";
  }

  const isProbe = state.circuitState === "HALF_OPEN";

  if (isProbe && state.probeInProgress) {
    return makeFallback(
      startedAt,
      0,
      "Recovery probe already running; cached route served."
    );
  }

  if (isProbe) state.probeInProgress = true;

  const maxAttempts = isProbe ? 1 : 3;
  let attemptsMade = 0;
  let lastError;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attemptsMade++;

      try {
        const route = await simulatedExternalService();

        state.consecutiveFailures = 0;
        state.circuitState = "CLOSED";
        state.circuitOpenedAt = null;
        state.lastKnownRoute = route;

        // A normal success is not automatically a recovery incident.
        if (state.activeIncidentId || isProbe) {
          await saveIncident(
            "recovered",
            "Simulated routing service recovered successfully.",
            { recoveryTimeMs: Date.now() - startedAt }
          );
        }

        return {
          route,
          source: "live",
          degraded: false,
          message: isProbe
            ? "Recovery probe succeeded; circuit CLOSED."
            : attempt > 1
              ? "Routing recovered after retry."
              : "Routing service responded successfully.",
          attempts: attemptsMade,
          recoveryTimeMs: Date.now() - startedAt,
        };
      } catch (error) {
        lastError = error;
        state.consecutiveFailures++;

        // Record the first observed failure, not only the final failure.
        if (!state.activeIncidentId) {
          await saveIncident(
            "recovering",
            error.message,
            { recoveryTimeMs: Date.now() - startedAt }
          );
        }

        if (
          isProbe ||
          state.consecutiveFailures >= 3
        ) {
          state.circuitState = "OPEN";
          state.circuitOpenedAt = Date.now();
          break;
        }

        if (attempt < maxAttempts) {
          await sleep(200 * 2 ** (attempt - 1));
        }
      }
    }

    const result = makeFallback(
      startedAt,
      attemptsMade,
      `${lastError?.message || "Routing service unavailable"}. Serving cached route.`
    );

    if (state.activeIncidentId) {
      await saveIncident(
        "recovering",
        result.message,
        { recoveryTimeMs: result.recoveryTimeMs }
      );
    }

    return result;
  } finally {
    if (isProbe) state.probeInProgress = false;
  }
}

async function recordRouteIncident(result) {
  if (result?.source === "fallback") {
    return saveIncident(
      "recovering",
      result.message || "Fallback route served; recovery is unconfirmed.",
      result
    );
  }

  if (result?.source === "live" && state.activeIncidentId) {
    return saveIncident(
      "recovered",
      "Simulated routing service recovered successfully.",
      result
    );
  }

  return null;
}

function resetChaos(mode = "off") {
  if (!["off", "once", "always"].includes(mode)) {
    throw new Error("failureMode must be off, once, or always");
  }

  state.failureMode = mode;
  state.failOnceConsumed = false;
  state.consecutiveFailures = 0;
  state.circuitState = "CLOSED";
  state.circuitOpenedAt = null;
  state.probeInProgress = false;

  // Do not erase an unresolved database incident just because the
  // test mode changes. A subsequent successful probe can resolve it.
}

module.exports = {
  state,
  getRouteWithHealing,
  recordRouteIncident,
  getCircuitStatus,
  resetChaos,
};
