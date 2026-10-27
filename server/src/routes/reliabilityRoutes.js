
// const express = require("express");
// const mongoose = require("mongoose");
// const Incident = require("../models/Incident");

// const {
//   state,
//   getRouteWithHealing,
//   recordRouteIncident,
//   getCircuitStatus: getSelfHealingCircuitStatus,
//   resetChaos,
// } = require("../services/selfHealing");

// const {
//   configureRoutingChaos,
//   getCircuitStatus: getOsrmCircuitStatus,
// } = require("../services/osrmService");

// const router = express.Router();

// const VALID_FAILURE_MODES = ["off", "once", "always"];

// // 1. Reliability overview
// router.get("/overview", async (req, res) => {
//   try {
//     const databaseHealthy = mongoose.connection.readyState === 1;

//     const [
//       totalIncidents,
//       successfulRecoveries,
//       activeIncidents,
//       failedIncidents,
//     ] = await Promise.all([
//       Incident.countDocuments(),
//       Incident.countDocuments({ status: "recovered" }),
//       Incident.countDocuments({
//         status: { $in: ["detected", "diagnosing", "recovering"] },
//       }),
//       Incident.countDocuments({ status: "failed" }),
//     ]);

//     return res.json({
//       success: true,
//       services: {
//         api: "healthy",
//         database: databaseHealthy ? "healthy" : "unavailable",
//         routingCircuit: getOsrmCircuitStatus().circuitState,
//         selfHealingCircuit:
//           getSelfHealingCircuitStatus().circuitState,
//       },
//       metrics: {
//         totalIncidents,
//         successfulRecoveries,
//         activeIncidents,
//         failedIncidents,
//         recoveryRate:
//           totalIncidents === 0
//             ? 0
//             : Number(
//                 ((successfulRecoveries / totalIncidents) * 100).toFixed(2)
//               ),
//       },
//       timestamp: new Date().toISOString(),
//     });
//   } catch (error) {
//     console.error("Reliability overview error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Unable to load reliability overview",
//     });
//   }
// });

// // 2. Get latest incidents
// router.get("/incidents", async (req, res) => {
//   try {
//     const incidents = await Incident.find()
//       .sort({ detectedAt: -1 })
//       .limit(100)
//       .lean();

//     return res.json({
//       success: true,
//       count: incidents.length,
//       incidents,
//     });
//   } catch (error) {
//     console.error("Load incidents error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Unable to load incidents",
//     });
//   }
// });

// // 3. Get one incident
// router.get("/incidents/:id", async (req, res) => {
//   try {
//     if (!mongoose.isValidObjectId(req.params.id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid incident ID",
//       });
//     }

//     const incident = await Incident.findById(req.params.id).lean();

//     if (!incident) {
//       return res.status(404).json({
//         success: false,
//         message: "Incident not found",
//       });
//     }

//     return res.json({ success: true, incident });
//   } catch (error) {
//     console.error("Get incident error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Unable to load incident",
//     });
//   }
// });

// // 4. Configure self-healing Chaos Lab
// router.post("/chaos/config", (req, res) => {
//   try {
//     const { failureMode } = req.body || {};

//     if (!VALID_FAILURE_MODES.includes(failureMode)) {
//       return res.status(400).json({
//         success: false,
//         message: "failureMode must be off, once, or always",
//       });
//     }

//     resetChaos(failureMode);

//     return res.json({
//       success: true,
//       message: `Self-healing Chaos Lab mode set to: ${failureMode}`,
//       state: getSelfHealingCircuitStatus(),
//     });
//   } catch (error) {
//     console.error("Self-healing chaos config error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Unable to configure self-healing Chaos Lab",
//     });
//   }
// });

// // 5. Test self-healing retry and fallback
// router.post("/chaos/test-route", async (req, res) => {
//   try {
//     const result = await getRouteWithHealing();
//     const incident = await recordRouteIncident(result);

//     return res.json({
//       success: true,
//       test: "self-healing-routing",
//       result,
//       circuit: getSelfHealingCircuitStatus(),
//       incident: incident || null,
//     });
//   } catch (error) {
//     console.error("Self-healing route test error:", error);

//     return res.status(error.statusCode || 500).json({
//       success: false,
//       message: error.message || "Chaos Lab test failed",
//       circuit: getSelfHealingCircuitStatus(),
//     });
//   }
// });

// // 6. Configure OSRM routing Chaos Lab
// router.post("/routing/chaos/config", (req, res) => {
//   try {
//     const { failureMode } = req.body || {};

//     if (!VALID_FAILURE_MODES.includes(failureMode)) {
//       return res.status(400).json({
//         success: false,
//         message: "failureMode must be off, once, or always",
//       });
//     }

//     const routingState = configureRoutingChaos(failureMode);

//     return res.json({
//       success: true,
//       message: `OSRM Chaos Lab mode set to: ${failureMode}`,
//       state: routingState || getOsrmCircuitStatus(),
//     });
//   } catch (error) {
//     console.error("OSRM chaos config error:", error);

//     return res.status(400).json({
//       success: false,
//       message: error.message || "Unable to configure OSRM Chaos Lab",
//     });
//   }
// });

// // 7. Get OSRM routing circuit state
// router.get("/routing/state", (req, res) => {
//   try {
//     return res.json({
//       success: true,
//       service: "osrm-routing-service",
//       ...getOsrmCircuitStatus(),
//     });
//   } catch (error) {
//     console.error("OSRM routing state error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Unable to get routing service state",
//     });
//   }
// });

// // 8. Get self-healing circuit state
// router.get("/chaos/state", (req, res) => {
//   try {
//     return res.json({
//       success: true,
//       ...getSelfHealingCircuitStatus(),
//       lastKnownRoute: state.lastKnownRoute,
//     });
//   } catch (error) {
//     console.error("Self-healing state error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Unable to get self-healing state",
//     });
//   }
// });

// module.exports = router;

const express = require("express");
const mongoose = require("mongoose");
const Incident = require("../models/Incident");

const {
  configureRoutingChaos,
  getCircuitStatus: getOsrmCircuitStatus,
  getRoadRouteWithHealing,

} = require("../services/osrmService");
  const {
  transition,
  OPEN_STATUSES,
  IN_PROGRESS_STATUSES,
} = require("../services/incidentLifecycle");
const Order = require("../models/Order");
const ChaosRun = require("../models/ChaosRun");
const sim = require("../services/riderSimulation");
const trackingHealer = require("../services/trackingHealer");
const { isSupervised } = require("../services/chaosRunner");
const { chaosEnabled, requireChaosAccess } = require("../middleware/chaosGuard");
// const { requireChaosAccess } = require("../middleware/chaosGuard");

const router = express.Router();

const VALID_FAILURE_MODES = ["off", "once", "always"];

function isValidCoordinates(point) {
  return (
    point &&
    typeof point.latitude === "number" &&
    typeof point.longitude === "number" &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

function getRouteReliability(route) {
  return {
    source: route.source || "unknown",
    degraded: Boolean(route.degraded),
    attempts: route.attempts || 0,
    recoveryTimeMs: route.recoveryTimeMs || 0,
    message: route.message || "",
    circuit: route.circuit || getOsrmCircuitStatus(),
  };
}

async function checkDatabase() {
  if (mongoose.connection.readyState !== 1) {
    return { status: "unavailable", latencyMs: null };
  }
  const startedAt = Date.now();
  try {
    const result = await Promise.race([
      mongoose.connection.db.admin().ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ping timeout")), 3000)),
    ]);
    return { status: result?.ok === 1 ? "healthy" : "degraded", latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { status: "unavailable", latencyMs: null, error: error.message };
  }
}

function average(values) {
  const numbers = values.filter((value) => Number.isFinite(value));
  if (!numbers.length) return null;
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

// Metrics are calculated from persisted incidents only.
async function computeMetrics() {
  const [byStatus, timings] = await Promise.all([
    Incident.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Incident.find({}, { detectionTimeMs: 1, recoveryTimeMs: 1, retryCount: 1, status: 1 }).lean(),
  ]);

  const counts = { detected: 0, diagnosing: 0, recovering: 0, verifying: 0, recovered: 0, degraded: 0, failed: 0 };
  byStatus.forEach((row) => {
    counts[row._id] = row.count;
  });

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const active = counts.detected + counts.diagnosing + counts.recovering + counts.verifying;
  const resolved = counts.recovered + counts.degraded + counts.failed;



  return {
    totalIncidents: total,
    activeIncidents: active,
    recovering: counts.recovering + counts.verifying + counts.diagnosing + counts.detected,
    successfulRecoveries: counts.recovered,
    degradedIncidents: counts.degraded,
    failedIncidents: counts.failed,
    byStatus: counts,
    successRate: resolved === 0 ? null : Number(((counts.recovered / resolved) * 100).toFixed(1)),
    // Kept for older clients: recovered / total.
    recoveryRate: total === 0 ? 0 : Number(((counts.recovered / total) * 100).toFixed(2)),
    avgTtdMs: average(timings.map((item) => item.detectionTimeMs)),
    avgTtrMs: average(timings.filter((item) => item.status === "recovered").map((item) => item.recoveryTimeMs)),
    totalRetries: timings.reduce((sum, item) => sum + (item.retryCount || 0), 0),
    definitions: {
      ttd: "Time to detect = detectedAt - faultStartedAt (first missed update or first failed call).",
      ttr: "Time to recover = recoveredAt - detectedAt, only for incidents whose recovery was verified.",
      successRate: "recovered / (recovered + degraded + failed). In-progress incidents are excluded.",
    },
  };
}

// 1. Reliability overview
router.get("/overview", async (req, res) => {
  try {
    const [database, metrics, trackedOrders] = await Promise.all([
      checkDatabase(),
      computeMetrics(),
      Order.countDocuments({ "tracking.simulationActive": true, status: { $ne: "Delivered" } }),
    ]);

    const routingCircuit = getOsrmCircuitStatus();
    const monitor = trackingHealer.getMonitorStatus();

    return res.json({
      success: true,
      services: {
        api: "healthy",
        database: database.status,
        databaseLatencyMs: database.latencyMs,
        routingCircuit: routingCircuit.circuitState,
        routing: {
          circuitState: routingCircuit.circuitState,
          failureMode: routingCircuit.failureMode,
          status:
            routingCircuit.circuitState === "CLOSED"
              ? "healthy"
              : routingCircuit.circuitState === "HALF_OPEN"
                ? "probing"
                : "degraded",
        },
        // Same value as routingCircuit; kept for older clients.
        selfHealingCircuit: routingCircuit.circuitState,
        tracking: {
          activeDeliveries: trackedOrders,
          workersRunning: sim.listWorkerIds().length,
          status: trackedOrders === sim.listWorkerIds().length ? "healthy" : "degraded",
        },
        healingEngine: { status: monitor.running ? "running" : "stopped", ...monitor },
        supervisor: {
          status: isSupervised() ? "pm2" : "not_supervised",
          pmId: process.env.pm_id ?? null,
          pid: process.pid,
          uptimeSeconds: Math.floor(process.uptime()),
        },
        chaosLab: chaosEnabled(),
      },
      circuit: routingCircuit,
      metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Reliability overview error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load reliability overview",
    });
  }
});

// Rider tracking panel: every delivery that expects live tracking.
router.get("/tracking", async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [
        { "tracking.simulationActive": true },
        { updatedAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) } },
      ],
    })
      .sort({ updatedAt: -1 })
      .limit(10);

    const riders = await Promise.all(
      orders.map(async (order) => ({
        orderId: order._id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        status: order.status,
        location: { latitude: order.location.latitude, longitude: order.location.longitude },
        routeProgress: order.routeProgress || 0,
        routePoints: order.routeCoordinates?.length || 0,
        worker: sim.getWorker(order._id),
        tracking: await trackingHealer.getTrackingState(order),
      }))
    );

    return res.json({ success: true, riders });
  } catch (error) {
    console.error("Tracking panel error:", error);
    return res.status(500).json({ success: false, message: "Unable to load rider tracking" });
  }
});

// 2. Get latest incidents
router.get("/incidents", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const incidents = await Incident.find()
      .sort({ detectedAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      count: incidents.length,
      incidents,
    });
  } catch (error) {
    console.error("Load incidents error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load incidents",
    });
  }
});

// 3. Get one incident
router.get("/incidents/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid incident ID",
      });
    }

    const incident = await Incident.findById(req.params.id).lean();

    if (!incident) {
      return res.status(404).json({
        success: false,
        message: "Incident not found",
      });
    }

    return res.json({
      success: true,
      incident,
    });
  } catch (error) {
    console.error("Get incident error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load incident",
    });
  }
});

// 4. Configure routing Chaos Lab
function configureChaos(req, res) {
  try {
    const { failureMode, durationMs } = req.body || {};

    if (!VALID_FAILURE_MODES.includes(failureMode)) {
      return res.status(400).json({
        success: false,
        message: "failureMode must be off, once, or always",
      });
    }

    const state = configureRoutingChaos(failureMode, { durationMs });

    return res.json({
      success: true,
      message: `Routing Chaos Lab mode set to: ${failureMode}`,
      state: state || getOsrmCircuitStatus(),
    });
  } catch (error) {
    console.error("Routing chaos config error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Unable to configure routing Chaos Lab",
    });
  }
}

router.post("/routing/chaos/config", requireChaosAccess, configureChaos);

// Compatibility with the previous frontend endpoint
router.post("/chaos/config", requireChaosAccess, configureChaos);

// 5. Test actual OSRM routing with self-healing
async function testRoute(req, res) {
  try {
    const { origin, destination } = req.body || {};

    if (!isValidCoordinates(origin) || !isValidCoordinates(destination)) {
      return res.status(400).json({
        success: false,
        message:
          "Valid origin and destination are required. Each must contain numeric latitude and longitude.",
      });
    }

    // const route = await getRoadRouteWithHealing(origin, destination);
    const route = await getRoadRouteWithHealing(origin, destination, {
  manualRecovery: true,
});

    return res.json({
      success: true,
      test: "osrm-self-healing-routing",
      result: {
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        coordinates: route.coordinates,
        steps: route.steps,
        source: route.source,
        degraded: route.degraded,
        attempts: route.attempts,
        recoveryTimeMs: route.recoveryTimeMs,
        message: route.message,
      },
      reliability: getRouteReliability(route),
      circuit: getOsrmCircuitStatus(),
    });
  } catch (error) {
    console.error("Routing test error:", error);

    return res.status(error.statusCode || 502).json({
      success: false,
      test: "osrm-self-healing-routing",
      message: error.message || "Routing test failed",
      attempts: error.attempts || 0,
      reliability: error.reliability || null,
      circuit: getOsrmCircuitStatus(),
    });
  }
}

router.post("/routing/test-route", requireChaosAccess, testRoute);

// Compatibility with the previous frontend endpoint.
// This endpoint now tests the actual OSRM routing service.
router.post("/chaos/test-route", requireChaosAccess, testRoute);

// 6. Get routing circuit state
function getRoutingState(req, res) {
  try {
    return res.json({
      success: true,
      service: "osrm-routing-service",
      ...getOsrmCircuitStatus(),
    });
  } catch (error) {
    console.error("Routing state error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to get routing service state",
    });
  }
}

router.get("/routing/state", getRoutingState);

// Compatibility with the previous frontend endpoint.
// Both endpoints report the same actual routing circuit.
router.get("/chaos/state", getRoutingState);

// Chaos Lab history for the portal.
router.get("/chaos-history", async (req, res) => {
  try {
    const runs = await ChaosRun.find().sort({ startedAt: -1 }).limit(20).lean();
    return res.json({ success: true, runs });
  } catch (error) {
    console.error("Chaos history error:", error);
    return res.status(500).json({ success: false, message: "Unable to load Chaos Lab history" });
  }
});



//changes
// Manual recovery for rider tracking incidents
// router.post(
//   "/incidents/:id/recover",
//   requireChaosAccess,
//   async (req, res) => {
//     try {
//       const { id } = req.params;

//       if (!mongoose.isValidObjectId(id)) {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid incident ID",
//         });
//       }

//       const result = await trackingHealer.recoverTrackingManually(id);

//       return res.json({
//         success: true,
//         message: "Tracking recovery verified successfully",
//         result,
//       });
//     } catch (error) {
//       console.error("Manual recovery failed:", error.message);

//       return res.status(error.statusCode || 500).json({
//         success: false,
//         message: error.message || "Manual recovery failed",
//       });
//     }
//   }
// );
// Manual recovery for supported incident types
const manualRecoveriesInProgress = new Set();

function parseRouteKey(routeKey) {
  if (typeof routeKey !== "string") {
    return null;
  }

  const values = routeKey.split(",").map(Number);

  if (values.length !== 4 || !values.every(Number.isFinite)) {
    return null;
  }

  const [originLongitude, originLatitude, destinationLongitude, destinationLatitude] =
    values;

  const origin = {
    longitude: originLongitude,
    latitude: originLatitude,
  };

  const destination = {
    longitude: destinationLongitude,
    latitude: destinationLatitude,
  };

  if (!isValidCoordinates(origin) || !isValidCoordinates(destination)) {
    return null;
  }

  return { origin, destination };
}

// router.post(
//   "/incidents/:id/recover",
//   requireChaosAccess,
//   async (req, res) => {
//     const { id } = req.params;

//     if (!mongoose.isValidObjectId(id)) {
//       return res.status(400).json({
//         success: false,
//         recovered: false,
//         message: "Invalid incident ID",
//       });
//     }

//     if (manualRecoveriesInProgress.has(id)) {
//       return res.status(409).json({
//         success: false,
//         recovered: false,
//         message: "Recovery is already in progress for this incident",
//       });
//     }

//     manualRecoveriesInProgress.add(id);

//     try {
//       const incident = await Incident.findById(id);

//       if (!incident) {
//         return res.status(404).json({
//           success: false,
//           recovered: false,
//           message: "Incident not found",
//         });
//       }

//       // Already recovered incidents must have passed verification.
//       if (incident.status === "recovered") {
//         if (incident.verification?.passed === true) {
//           return res.json({
//             success: true,
//             recovered: true,
//             alreadyRecovered: true,
//             message: "Incident was already recovered and verified",
//             result: incident,
//           });
//         }

//         return res.status(409).json({
//           success: false,
//           recovered: false,
//           message: "Incident is marked recovered but verification has not passed",
//           result: incident,
//         });
//       }

//       // Do not start a second lifecycle while another process is handling it.
//       if (
//         ["diagnosing", "recovering", "verifying"].includes(incident.status)
//       ) {
//         return res.status(409).json({
//           success: false,
//           recovered: false,
//           message: `Incident is currently ${incident.status}`,
//           result: incident,
//         });
//       }

//       if (!["detected", "degraded", "failed"].includes(incident.status)) {
//         return res.status(409).json({
//           success: false,
//           recovered: false,
//           message: `Manual recovery is not supported for status: ${incident.status}`,
//           result: incident,
//         });
//       }

//       // 1. Rider tracking recovery: preserve the existing healer.
//       if (incident.incidentType === "rider_tracking_stale") {
//         const result = await trackingHealer.recoverTrackingManually(id);

//         const verified =
//           result?.status === "recovered" &&
//           result?.verification?.passed === true;

//         if (!verified) {
//           return res.status(422).json({
//             success: false,
//             recovered: false,
//             message: "Tracking recovery could not be verified",
//             result,
//           });
//         }

//         return res.json({
//           success: true,
//           recovered: true,
//           message: "Tracking recovery verified successfully",
//           result,
//         });
//       }

//       // 2. Invalid tracking data is handled by the existing tracking healer.
//       // Never mark it recovered manually without a dedicated verification flow.
//       if (incident.incidentType === "invalid_tracking_data") {
//         return res.status(409).json({
//           success: false,
//           recovered: false,
//           message:
//             "Invalid tracking data incidents must be verified by the tracking healer. Manual status changes are not allowed.",
//           result: incident,
//         });
//       }

//       // 3. External routing service recovery.
//       if (incident.incidentType === "external_route_service_failure") {
//         const parsedRoute = parseRouteKey(incident.routeKey);

//         if (!parsedRoute) {
//           return res.status(422).json({
//             success: false,
//             recovered: false,
//             message: "Cannot recover routing incident: route coordinates are invalid",
//           });
//         }

//         await transition(id, "diagnosing", {
//           note: "Manual routing recovery requested",
//           rootCause:
//             incident.rootCause ||
//             "External routing service failure; testing live route availability",
//         });

//         await transition(id, "recovering", {
//           note: "Attempting to obtain a live route from the routing service",
//           action: {
//             name: "manual_routing_recovery",
//             ok: false,
//             detail: "Live routing verification started",
//           },
//         });

//         await transition(id, "verifying", {
//           note: "Checking whether the routing service returned a live route",
//         });

//         let routeResult;

//         try {
//           routeResult = await getRoadRouteWithHealing(
//             parsedRoute.origin,
//             parsedRoute.destination
//           );
//         } catch (routeError) {
//           await transition(id, "degraded", {
//             note: "Routing recovery attempt failed",
//             action: {
//               name: "manual_routing_recovery",
//               ok: false,
//               detail: routeError.message || "Routing service is unavailable",
//             },
//             verification: {
//               passed: false,
//               detail: "No successful live route was returned",
//             },
//           });

//           return res.status(422).json({
//             success: false,
//             recovered: false,
//             message: "Routing recovery failed; the live service is not verified",
//             error: routeError.message,
//           });
//         }

//         // Cached or degraded routes are NOT proof that OSRM has recovered.
//         const liveRouteVerified =
//           routeResult?.source === "osrm" &&
//           routeResult?.degraded === false &&
//           Array.isArray(routeResult?.coordinates) &&
//           routeResult.coordinates.length > 0;

//         if (!liveRouteVerified) {
//           await transition(id, "degraded", {
//             note: "A live OSRM route could not be verified",
//             action: {
//               name: "manual_routing_recovery",
//               ok: false,
//               detail:
//                 routeResult?.message ||
//                 "Only a fallback or degraded route was available",
//             },
//             verification: {
//               passed: false,
//               detail:
//                 "Recovery requires a live OSRM route; cached routes do not qualify",
//             },
//             evidence: {
//               manualRecoveryRouteSource: routeResult?.source || "unavailable",
//               manualRecoveryDegraded: routeResult?.degraded ?? true,
//             },
//           });

//           return res.status(422).json({
//             success: false,
//             recovered: false,
//             message:
//               "Routing service is still degraded. A cached route does not count as recovery.",
//             route: getRouteReliability(routeResult),
//           });
//         }

//         const recoveredIncident = await transition(id, "recovered", {
//           note: "Live routing service returned a valid route",
//           action: {
//             name: "manual_routing_recovery",
//             ok: true,
//             detail: "Live OSRM route successfully verified",
//           },
//           verification: {
//             passed: true,
//             detail:
//               "OSRM returned a live, non-degraded route with route coordinates",
//           },
//           evidence: {
//             manualRecoveryRouteSource: routeResult.source,
//             manualRecoveryDegraded: false,
//             manualRecoveryVerifiedAt: new Date(),
//           },
//         });

//         if (
//           !recoveredIncident ||
//           recoveredIncident.status !== "recovered" ||
//           recoveredIncident.verification?.passed !== true
//         ) {
//           return res.status(500).json({
//             success: false,
//             recovered: false,
//             message: "Route verification succeeded, but incident recovery was not persisted",
//           });
//         }

//         return res.json({
//           success: true,
//           recovered: true,
//           message: "Routing recovery verified using a live OSRM route",
//           result: recoveredIncident,
//           route: getRouteReliability(routeResult),
//         });
//       }

//       return res.status(400).json({
//         success: false,
//         recovered: false,
//         message: `Manual recovery is not implemented for incident type: ${incident.incidentType}`,
//       });
//     } catch (error) {
//       console.error("Manual recovery failed:", error.message);

//       return res.status(error.statusCode || 500).json({
//         success: false,
//         recovered: false,
//         message: error.message || "Manual recovery failed",
//       });
//     } finally {
//       manualRecoveriesInProgress.delete(id);
//     }
//   }
// );
router.post(
  "/incidents/:id/recover",
  requireChaosAccess,
  async (req, res) => {
    const { id } = req.params;

    try {
      // 1. Validate incident ID
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid incident ID",
        });
      }

      // 2. Find incident
      const incident = await Incident.findById(id);

      if (!incident) {
        return res.status(404).json({
          success: false,
          message: "Incident not found",
        });
      }

      // 3. Already recovered? Return actual verification state.
      if (incident.status === "recovered") {
        if (incident.verification?.passed === true) {
          return res.json({
            success: true,
            message: "Incident is already verified as recovered",
            incident,
          });
        }

        return res.status(409).json({
          success: false,
          message: "Incident is marked recovered without successful verification",
        });
      }

      // 4. Do not run two recovery attempts simultaneously.
      // if (IN_PROGRESS_STATUSES.includes(incident.status)) {
      //   return res.status(409).json({
      //     success: false,
      //     message: "Incident recovery is already in progress",
      //     status: incident.status,
      //   });
      // }
      // 4. Allow safe retry of an abandoned rider-tracking recovery.
// Never reset the status while its recovery is actively running.
if (IN_PROGRESS_STATUSES.includes(incident.status)) {
  if (incident.incidentType !== "rider_tracking_stale") {
    return res.status(409).json({
      success: false,
      message: "Incident recovery is already in progress",
      status: incident.status,
    });
  }

  if (
    !incident.orderId ||
    trackingHealer.isRecoveryInProgress(incident.orderId)
  ) {
    return res.status(409).json({
      success: false,
      message: "Tracking recovery is currently active or cannot be safely retried",
      status: incident.status,
    });
  }

  // No active in-process recovery exists. Move the abandoned incident
  // to a retryable state; the healer must still verify recovery.
  await transition(id, "degraded", {
    note: "Previous tracking recovery was no longer active; manual retry requested",
    action: {
      name: "prepare_manual_retry",
      ok: true,
      detail: "Incident reset to degraded for a new verified recovery attempt",
    },
    verification: {
      passed: false,
      detail: "Previous attempt was not verified as recovered",
    },
  });
}

      // 5. Only allow known recoverable states.
      if (!["detected", "degraded", "failed"].includes(incident.status)) {
        return res.status(409).json({
          success: false,
          message: `Cannot manually recover an incident in status '${incident.status}'`,
        });
      }

      // ---------------------------------------------------------
      // A. RIDER TRACKING STALE
      // ---------------------------------------------------------
      if (incident.incidentType === "rider_tracking_stale") {
        const result = await trackingHealer.recoverTrackingManually(id);

        // Do not report success unless the healer verified recovery.
        const latestIncident = await Incident.findById(id);

        if (
          latestIncident?.status !== "recovered" ||
          latestIncident?.verification?.passed !== true
        ) {
          return res.status(422).json({
            success: false,
            message: "Tracking recovery could not be verified",
            incident: latestIncident,
            result,
          });
        }

        return res.json({
          success: true,
          message: "Tracking recovery verified successfully",
          incident: latestIncident,
          result,
        });
      }

      // ---------------------------------------------------------
      // B. EXTERNAL ROUTE SERVICE FAILURE
      // ---------------------------------------------------------
      if (incident.incidentType === "external_route_service_failure") {
        if (!incident.routeKey) {
          return res.status(422).json({
            success: false,
            message: "Routing incident has no routeKey; cannot safely retry",
          });
        }

        /*
         * Expected routeKey format:
         * originLongitude,originLatitude,destinationLongitude,destinationLatitude
         */
        const values = String(incident.routeKey)
          .split(",")
          .map((value) => Number(value.trim()));

        if (
          values.length !== 4 ||
          !values.every(Number.isFinite)
        ) {
          return res.status(422).json({
            success: false,
            message: "Routing incident has an invalid routeKey",
          });
        }

        const [originLongitude, originLatitude, destinationLongitude, destinationLatitude] =
          values;

        const origin = {
          longitude: originLongitude,
          latitude: originLatitude,
        };

        const destination = {
          longitude: destinationLongitude,
          latitude: destinationLatitude,
        };

        if (
          !isValidCoordinates(origin) ||
          !isValidCoordinates(destination)
        ) {
          return res.status(422).json({
            success: false,
            message: "Routing incident contains invalid coordinates",
          });
        }

        // Move the incident into recovery.
        await transition(id, "recovering", {
          note: "Manual recovery requested; retrying the external routing service",
          action: {
            name: "manual_routing_recovery",
            ok: true,
            detail: "Retrying OSRM and verifying a live route",
          },
        });

        try {
          // Stop the injected routing failure before testing recovery.
          if (incident.source === "chaos_lab") {
            configureRoutingChaos("off");
          }

          await transition(id, "verifying", {
            note: "Requesting a live route to verify external service recovery",
          });

          const route = await getRoadRouteWithHealing(origin, destination);

          /*
           * A cached/degraded response is not proof of recovery.
           * Require a live OSRM response.
           */
          const verified =
            route?.source === "osrm" &&
            route?.degraded === false &&
            Array.isArray(route?.coordinates) &&
            route.coordinates.length > 1;

          if (!verified) {
            await transition(id, "degraded", {
              note: "Routing retry did not produce a verified live OSRM route",
              action: {
                name: "manual_routing_recovery",
                ok: false,
                detail: "Live route verification failed; service may still be degraded",
              },
              verification: {
                passed: false,
                detail: "A live, non-degraded OSRM route was not returned",
              },
            });

            return res.status(422).json({
              success: false,
              message:
                "Routing service recovery could not be verified. The route may be cached or degraded.",
              route: getRouteReliability(route),
              incident: await Incident.findById(id),
            });
          }

          // Mark recovered only after the live route passes verification.
          const recoveredIncident = await transition(id, "recovered", {
            rootCause: "External routing service failure; live OSRM route restored",
            note: "Manual recovery verified using a live OSRM route",
            action: {
              name: "manual_routing_recovery",
              ok: true,
              detail: "Live OSRM route returned and verified",
            },
            verification: {
              passed: true,
              detail: "OSRM returned a live route with degraded=false",
            },
            evidence: {
              manualRecovery: true,
              verifiedRouteSource: route.source,
              verifiedAt: new Date().toISOString(),
            },
          });

          return res.json({
            success: true,
            message: "Routing service recovery verified successfully",
            incident: recoveredIncident,
            route: getRouteReliability(route),
          });
        } catch (recoveryError) {
          console.error(
            "Manual routing recovery failed:",
            recoveryError.message
          );

          const currentIncident = await Incident.findById(id);

          // Do not overwrite a concurrently verified recovery.
          if (
            currentIncident &&
            currentIncident.status !== "recovered"
          ) {
            await transition(id, "degraded", {
              note: "Manual routing retry failed; service recovery remains unverified",
              action: {
                name: "manual_routing_recovery",
                ok: false,
                detail: recoveryError.message,
              },
              verification: {
                passed: false,
                detail: "The live routing request failed",
              },
            });
          }

          return res.status(422).json({
            success: false,
            message: "Routing recovery failed; the incident remains unresolved",
            error: recoveryError.message,
            incident: await Incident.findById(id),
          });
        }
      }

      // ---------------------------------------------------------
      // C. INVALID TRACKING DATA
      // ---------------------------------------------------------
      if (incident.incidentType === "invalid_tracking_data") {
        if (!incident.orderId) {
          return res.status(422).json({
            success: false,
            message: "Incident has no associated order to verify",
          });
        }

        const order = await Order.findById(incident.orderId);

        if (!order) {
          return res.status(404).json({
            success: false,
            message: "Associated order not found; tracking data cannot be verified",
          });
        }

        const location = order.location;

        const validLocation =
          location &&
          isValidCoordinates({
            latitude: Number(location.latitude),
            longitude: Number(location.longitude),
          });

        const validProgress =
          Number.isFinite(Number(order.routeProgress)) &&
          Number(order.routeProgress) >= 0 &&
          Number(order.routeProgress) <= 100;

        /*
         * Verify the current stored state. Do not write or invent a
         * replacement location here; preserve the existing order data.
         */
        if (!validLocation || !validProgress) {
          await transition(id, "degraded", {
            note: "Manual verification found invalid persisted tracking data",
            action: {
              name: "verify_tracking_data",
              ok: false,
              detail: "Stored location or route progress failed validation",
            },
            verification: {
              passed: false,
              detail: "Persisted tracking data is still invalid",
            },
          });

          return res.status(422).json({
            success: false,
            message:
              "Tracking data is still invalid. The incident cannot be marked recovered.",
            incident: await Incident.findById(id),
          });
        }

        const recoveredIncident = await transition(id, "recovered", {
          rootCause: "Invalid tracking update was rejected; persisted tracking state passed validation",
          note: "Manual verification confirmed that the stored tracking state is valid",
          action: {
            name: "verify_tracking_data",
            ok: true,
            detail: "Existing stored location and route progress passed validation",
          },
          verification: {
            passed: true,
            detail:
              "Stored coordinates and route progress are valid; no replacement data was fabricated",
          },
          evidence: {
            manualRecovery: true,
            persistedLocationValid: true,
            persistedRouteProgressValid: true,
            verifiedAt: new Date().toISOString(),
          },
        });

        return res.json({
          success: true,
          message: "Persisted tracking data verified successfully",
          incident: recoveredIncident,
        });
      }

      // ---------------------------------------------------------
      // D. UNSUPPORTED INCIDENT TYPE
      // ---------------------------------------------------------
      return res.status(422).json({
        success: false,
        message: `Manual recovery is not implemented for incident type '${incident.incidentType}'`,
      });
    } catch (error) {
      console.error("Manual recovery failed:", error.message);

      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Manual recovery failed",
      });
    }
  }
);

module.exports = router;  