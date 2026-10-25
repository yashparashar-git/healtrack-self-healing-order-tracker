
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

    const route = await getRoadRouteWithHealing(origin, destination);

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
router.post(
  "/incidents/:id/recover",
  requireChaosAccess,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid incident ID",
        });
      }

      const result = await trackingHealer.recoverTrackingManually(id);

      return res.json({
        success: true,
        message: "Tracking recovery verified successfully",
        result,
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