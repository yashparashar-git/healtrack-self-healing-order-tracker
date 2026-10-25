// Test-only, in-memory fault registry used by the Chaos Lab.
// Every fault is bounded (count and/or expiry) and can be cleared at once.
// Nothing here touches stored data; faults only make guarded code paths
// skip or fail an operation before it runs.

const MAX_FAULT_MS = 60000;

const trackingFaults = new Map(); // orderId -> fault
let dbFault = null;

function boundedDuration(durationMs, fallback) {
  const value = Number(durationMs) || fallback;
  return Math.min(Math.max(value, 1000), MAX_FAULT_MS);
}

// mode "stuck_worker": the worker generation that was running when the
//   fault was injected keeps ticking but stops producing location writes.
//   A restarted worker (new generation) is not affected.
// mode "device_offline": every location write for the order fails until
//   the fault expires, regardless of worker restarts.
function injectTrackingFault({ orderId, mode, generation, durationMs, runId }) {
  const fault = {
    orderId: String(orderId),
    mode,
    generation,
    runId,
    injectedAt: Date.now(),
    expiresAt: Date.now() + boundedDuration(durationMs, 20000),
  };
  trackingFaults.set(fault.orderId, fault);
  return fault;
}

function findTrackingFault(orderId) {
  const fault = trackingFaults.get(String(orderId));
  if (!fault) return null;
  if (Date.now() >= fault.expiresAt) {
    trackingFaults.delete(String(orderId));
    return null;
  }
  return fault;
}

// Returns the fault affecting a write from the given worker generation.
function getTrackingFault(orderId, generation) {
  const fault = findTrackingFault(orderId);
  if (!fault) return null;
  if (fault.mode === "stuck_worker" && fault.generation !== generation) return null;
  return fault;
}

function clearTrackingFault(orderId) {
  trackingFaults.delete(String(orderId));
}

function injectDbFault({ op, failCount, runId, durationMs }) {
  dbFault = {
    op,
    remaining: Math.min(Math.max(Number(failCount) || 1, 1), 5),
    runId,
    injectedAt: Date.now(),
    expiresAt: Date.now() + boundedDuration(durationMs, 30000),
  };
  return { ...dbFault };
}

function consumeDbFault(op) {
  if (!dbFault) return null;
  if (Date.now() >= dbFault.expiresAt || dbFault.remaining <= 0) {
    dbFault = null;
    return null;
  }
  if (dbFault.op !== op) return null;
  dbFault.remaining -= 1;
  return { ...dbFault };
}

function clearDbFault() {
  dbFault = null;
}

// Runs fn unless a database fault is armed for this operation, in which case
// a retryable error is thrown before the database is contacted.
async function guardedDbOp(op, fn) {
  const fault = consumeDbFault(op);
  if (fault) {
    const error = new Error(
      `Simulated transient database error during ${op} (Chaos Lab fault; operation not sent to MongoDB)`
    );
    error.code = "CHAOS_DB_TRANSIENT";
    error.retryable = true;
    throw error;
  }
  return fn();
}

function snapshot() {
  const tracking = [];
  for (const orderId of trackingFaults.keys()) {
    const fault = findTrackingFault(orderId);
    if (fault) {
      tracking.push({
        orderId: fault.orderId,
        mode: fault.mode,
        runId: fault.runId,
        expiresInMs: Math.max(0, fault.expiresAt - Date.now()),
      });
    }
  }

  const db =
    dbFault && Date.now() < dbFault.expiresAt && dbFault.remaining > 0
      ? {
          op: dbFault.op,
          remaining: dbFault.remaining,
          runId: dbFault.runId,
          expiresInMs: Math.max(0, dbFault.expiresAt - Date.now()),
        }
      : null;

  return { tracking, db };
}

function clearAll() {
  trackingFaults.clear();
  dbFault = null;
}

module.exports = {
  MAX_FAULT_MS,
  injectTrackingFault,
  getTrackingFault,
  findTrackingFault,
  clearTrackingFault,
  injectDbFault,
  clearDbFault,
  guardedDbOp,
  snapshot,
  clearAll,
};
