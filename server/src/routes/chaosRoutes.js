const express = require("express");
const ChaosRun = require("../models/ChaosRun");
const Order = require("../models/Order");
const chaos = require("../services/chaosRunner");
const sim = require("../services/riderSimulation");
const { chaosEnabled, requireChaosAccess } = require("../middleware/chaosGuard");

const router = express.Router();

// Lab status: enabled flag, active run, armed faults, routing circuit.
router.get("/status", (req, res) => {
  res.json({ success: true, ...chaosEnabled(), ...chaos.getStatus() });
});

router.get("/scenarios", (req, res) => {
  const crash = chaos.crashDemoStatus();
  const scenarios = Object.values(chaos.SCENARIOS).map((scenario) => ({
    ...scenario,
    available: scenario.id === "process_crash" ? crash.available : true,
    unavailableReason: scenario.id === "process_crash" ? crash.reason : null,
  }));
  res.json({ success: true, scenarios });
});

// Orders that can be used as test targets (most recent first).
router.get("/targets", async (req, res) => {
  try {
    const orders = await Order.find({ status: { $ne: "Delivered" } })
      .sort({ createdAt: -1 })
      .limit(20)
      .select("orderNumber customerName status routeProgress routeCoordinates tracking createdAt")
      .lean();

    res.json({
      success: true,
      targets: orders.map((order) => ({
        id: order._id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        status: order.status,
        routeProgress: order.routeProgress || 0,
        routePoints: order.routeCoordinates?.length || 0,
        simulationRunning: sim.isRunning(order._id),
      })),
    });
  } catch (error) {
    console.error("Chaos targets:", error.message);
    res.status(500).json({ success: false, message: "Unable to load target orders" });
  }
});

router.get("/runs", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const runs = await ChaosRun.find().sort({ startedAt: -1 }).limit(limit).lean();
    res.json({ success: true, count: runs.length, runs });
  } catch (error) {
    console.error("Chaos runs:", error.message);
    res.status(500).json({ success: false, message: "Unable to load Chaos Lab runs" });
  }
});

router.get("/runs/:runId", async (req, res) => {
  try {
    const run = await ChaosRun.findOne({ runId: String(req.params.runId) }).lean();
    if (!run) return res.status(404).json({ success: false, message: "Run not found" });
    return res.json({ success: true, run });
  } catch (error) {
    console.error("Chaos run:", error.message);
    return res.status(500).json({ success: false, message: "Unable to load run" });
  }
});

// Start a scenario. Body: { scenario, orderId?, params? }
router.post("/runs", requireChaosAccess, async (req, res) => {
  try {
    const { scenario, orderId, params } = req.body || {};
    const run = await chaos.startRun({
      scenario: String(scenario || ""),
      orderId: orderId ? String(orderId) : null,
      params: params && typeof params === "object" ? params : {},
      triggeredBy: `local operator (${req.socket.remoteAddress})`,
    });
    return res.status(202).json({ success: true, message: "Chaos run started", run });
  } catch (error) {
    if (!error.statusCode) console.error("Start chaos run:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Unable to start Chaos Lab run",
    });
  }
});

// Clears every armed fault. Incidents and run history are kept.
router.post("/reset", requireChaosAccess, (req, res) => {
  res.json({ success: true, message: "All injected faults cleared", ...chaos.resetFaults() });
});

module.exports = router;
