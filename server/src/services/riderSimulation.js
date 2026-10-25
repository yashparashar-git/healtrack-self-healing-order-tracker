const Order = require("../models/Order");
const { getTrackingFault, guardedDbOp } = require("./faultInjector");

const STATUSES = ["Placed", "Confirmed", "Preparing", "Out for Delivery", "Delivered"];
const UPDATE_INTERVAL_MS = 3000;
// A location older than this while a worker should be running is stale.
const STALE_AFTER_MS = Math.round(UPDATE_INTERVAL_MS * 2.5);

// orderId -> { timer, generation, startedAt, lastTickAt, lastWriteAt, tickInProgress }
const workers = new Map();
// orderId -> time the rider was stopped on purpose (operator or delivery).
const recentlyStopped = new Map();
let nextGeneration = 1;

function markStopped(orderId) {
  recentlyStopped.set(String(orderId), Date.now());
}

// True for a short window after an intentional stop, so the staleness
// monitor does not mistake it for a lost worker.
function wasRecentlyStopped(orderId) {
  const at = recentlyStopped.get(String(orderId));
  if (!at) return false;
  if (Date.now() - at > STALE_AFTER_MS * 2) {
    recentlyStopped.delete(String(orderId));
    return false;
  }
  return true;
}

function validCoordinates(latitude, longitude) {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

// Persists one confirmed rider position. Progress never moves backwards.
async function writeConfirmedLocation(order, { latitude, longitude, progress, status }) {
  if (!validCoordinates(latitude, longitude)) {
    throw new Error("Refusing to persist invalid rider coordinates");
  }

  await guardedDbOp("tracking-location-write", async () => {
    const now = new Date();
    order.location.latitude = latitude;
    order.location.longitude = longitude;
    order.location.updatedAt = now;
    if (Number.isInteger(progress)) {
      order.routeProgress = Math.max(order.routeProgress || 0, progress);
    }
    if (status) order.status = status;
    order.tracking = order.tracking || {};
    order.tracking.lastSuccessfulLocationAt = now;
    order.tracking.consecutiveFailures = 0;
    await order.save();
  });
}

async function recordTrackingFailure(orderId, message) {
  try {
    await Order.updateOne(
      { _id: orderId },
      {
        $set: { "tracking.lastError": message, "tracking.lastErrorAt": new Date() },
        $inc: { "tracking.consecutiveFailures": 1 },
      }
    );
  } catch (error) {
    console.error("Unable to record tracking failure:", error.message);
  }
}

async function setSimulationActive(orderId, active) {
  await Order.updateOne({ _id: orderId }, { $set: { "tracking.simulationActive": active } });
}

function stopWorker(orderId) {
  const worker = workers.get(String(orderId));
  if (worker) {
    clearInterval(worker.timer);
    workers.delete(String(orderId));
  }
}

async function tick(orderId, generation) {
  const worker = workers.get(orderId);
  if (!worker || worker.generation !== generation || worker.tickInProgress) return;

  worker.tickInProgress = true;
  worker.lastTickAt = Date.now();

  try {
    const fault = getTrackingFault(orderId, generation);

    // A stalled worker keeps ticking but produces no update. Only the
    // staleness monitor can notice this, as with a real hung worker.
    if (fault?.mode === "stuck_worker") return;

    const order = await Order.findById(orderId);

    if (!order || order.status === "Delivered") {
      markStopped(orderId);
      stopWorker(orderId);
      if (order) await setSimulationActive(orderId, false);
      return;
    }

    if (fault?.mode === "device_offline") {
      throw new Error("Rider device is not reporting a location (network unreachable)");
    }

    const statusIndex = STATUSES.indexOf(order.status);
    const outForDeliveryIndex = STATUSES.indexOf("Out for Delivery");

    if (statusIndex < 0) {
      stopWorker(orderId);
      await setSimulationActive(orderId, false);
      return;
    }

    // Before dispatch the rider is at the hub; confirm that position as a
    // heartbeat while the order moves through the preparation stages.
    if (statusIndex < outForDeliveryIndex) {
      await writeConfirmedLocation(order, {
        latitude: order.location.latitude,
        longitude: order.location.longitude,
        status: STATUSES[statusIndex + 1],
      });
      worker.lastWriteAt = Date.now();
      return;
    }

    const route = order.routeCoordinates || [];
    const nextIndex = Math.min((order.routeProgress || 0) + 1, route.length - 1);
    const point = route[nextIndex];

    if (!Array.isArray(point) || point.length < 2 || !validCoordinates(Number(point[1]), Number(point[0]))) {
      // Keep the last valid position; do not write a bad point.
      throw new Error(`Route point ${nextIndex} is invalid; last valid location kept`);
    }

    const reachedDestination = nextIndex >= route.length - 1;
    const destination = order.destinationLocation;
    const useDestination =
      reachedDestination && validCoordinates(destination?.latitude, destination?.longitude);

    await writeConfirmedLocation(order, {
      latitude: useDestination ? destination.latitude : Number(point[1]),
      longitude: useDestination ? destination.longitude : Number(point[0]),
      progress: nextIndex,
      status: reachedDestination ? "Delivered" : undefined,
    });
    worker.lastWriteAt = Date.now();

    if (reachedDestination) {
      markStopped(orderId);
      stopWorker(orderId);
      await setSimulationActive(orderId, false);
      console.log(`Order ${order.orderNumber} delivered`);
    }
  } catch (error) {
    worker.lastError = error.message;
    await recordTrackingFailure(orderId, error.message);
  } finally {
    worker.tickInProgress = false;
  }
}

// Starts a worker for an order. Idempotent: an existing worker is reused.
// reset=true moves the rider back to the pickup (the "Start rider" action);
// reset=false resumes from the last persisted progress.
async function startSimulation(orderId, { reset = true } = {}) {
  orderId = String(orderId);

  if (workers.has(orderId)) {
    return { started: false, alreadyRunning: true, generation: workers.get(orderId).generation };
  }

  recentlyStopped.delete(orderId);
  const order = await Order.findById(orderId);
  if (!order) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }
  if (order.status === "Delivered") {
    const error = new Error("Order is already delivered");
    error.statusCode = 400;
    throw error;
  }
  if (!order.routeCoordinates || order.routeCoordinates.length < 2) {
    const error = new Error(
      "This order has no calculated road route. Create it again with a valid destination address."
    );
    error.statusCode = 400;
    throw error;
  }

  // Re-check after the await: another request may have started a worker.
  if (workers.has(orderId)) {
    return { started: false, alreadyRunning: true, generation: workers.get(orderId).generation };
  }

  const generation = nextGeneration++;
  const worker = {
    generation,
    startedAt: Date.now(),
    lastTickAt: null,
    lastWriteAt: null,
    lastError: null,
    tickInProgress: false,
  };
  worker.timer = setInterval(() => tick(orderId, generation), UPDATE_INTERVAL_MS);
  workers.set(orderId, worker);

  order.tracking = order.tracking || {};
  order.tracking.simulationActive = true;

  if (reset) {
    order.location.latitude = order.pickupLocation.latitude;
    order.location.longitude = order.pickupLocation.longitude;
    order.location.updatedAt = new Date();
    order.routeProgress = 0;
    order.tracking.lastSuccessfulLocationAt = new Date();
    order.tracking.consecutiveFailures = 0;
  }

  await order.save();
  return { started: true, alreadyRunning: false, generation };
}

async function stopSimulation(orderId) {
  markStopped(orderId);
  await setSimulationActive(orderId, false);
  stopWorker(orderId);
}

// Replaces the worker for an order without resetting its progress.
async function restartWorker(orderId) {
  stopWorker(orderId);
  return startSimulation(orderId, { reset: false });
}

// After a server restart, resume every simulation that was active.
async function resumeActiveSimulations() {
  const orders = await Order.find({
    "tracking.simulationActive": true,
    status: { $ne: "Delivered" },
  }).select("_id");

  const resumed = [];
  for (const order of orders) {
    try {
      const result = await startSimulation(order._id, { reset: false });
      if (result.started) resumed.push(String(order._id));
    } catch (error) {
      console.error(`Could not resume simulation for ${order._id}:`, error.message);
    }
  }
  return resumed;
}

function getWorker(orderId) {
  const worker = workers.get(String(orderId));
  if (!worker) return null;
  return {
    generation: worker.generation,
    startedAt: worker.startedAt,
    lastTickAt: worker.lastTickAt,
    lastWriteAt: worker.lastWriteAt,
    lastError: worker.lastError,
  };
}

function isRunning(orderId) {
  return workers.has(String(orderId));
}

function listWorkerIds() {
  return [...workers.keys()];
}

module.exports = {
  STATUSES,
  UPDATE_INTERVAL_MS,
  STALE_AFTER_MS,
  validCoordinates,
  writeConfirmedLocation,
  startSimulation,
  stopSimulation,
  restartWorker,
  resumeActiveSimulations,
  getWorker,
  isRunning,
  wasRecentlyStopped,
  listWorkerIds,
};
