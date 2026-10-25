const Incident = require("../models/Incident");

// Statuses in which an incident is still being handled. "degraded" is
// included because a later verified recovery may still resolve it.
const OPEN_STATUSES = ["detected", "diagnosing", "recovering", "verifying", "degraded"];
const IN_PROGRESS_STATUSES = ["detected", "diagnosing", "recovering", "verifying"];

async function openIncident({
  incidentType,
  service,
  severity = "medium",
  source = "monitor",
  scenario = null,
  runId = null,
  orderId = null,
  routeKey = null,
  faultStartedAt = null,
  diagnosis = "Diagnosis pending",
  evidence = {},
}) {
  const now = new Date();
  const faultAt = faultStartedAt ? new Date(faultStartedAt) : now;

  return Incident.create({
    incidentType,
    service,
    severity,
    source,
    scenario,
    runId,
    orderId,
    routeKey,
    status: "detected",
    diagnosis,
    detectedAt: now,
    faultStartedAt: faultAt,
    detectionTimeMs: Math.max(0, now - faultAt),
    evidence,
    timeline: [{ status: "detected", at: now, note: diagnosis }],
  });
}

// Moves one incident record forward. The same _id is kept for the whole
// lifecycle; a timeline entry is added only when the status changes.
async function transition(incidentId, status, opts = {}) {
  const incident = await Incident.findById(incidentId);
  if (!incident) return null;

  if (status === "recovered" && opts.verification?.passed !== true) {
    throw new Error("An incident cannot be marked recovered without a passed verification");
  }

  const now = new Date();
  const changed = incident.status !== status;

  incident.status = status;

  if (opts.rootCause) {
    incident.rootCause = opts.rootCause;
    incident.diagnosis = opts.rootCause;
  }

  if (opts.evidence) {
    incident.evidence = { ...(incident.evidence || {}), ...opts.evidence };
    incident.markModified("evidence");
  }

  if (opts.action) {
    incident.actions.push({ ...opts.action, at: now });
    incident.recoveryAction = opts.action.detail || opts.action.name;
  }

  if (opts.retry) incident.retryCount += 1;

  if (opts.verification) {
    incident.verification = { ...opts.verification, at: now };
  }

  if (status === "recovered") {
    incident.recoveredAt = now;
    incident.recoveryTimeMs = Math.max(0, now - incident.detectedAt);
  }

  if (status === "recovered" || status === "failed") {
    incident.resolvedAt = now;
  }

  if (changed) {
    incident.timeline.push({ status, at: now, note: opts.note || "" });
  }

  await incident.save();
  return incident;
}

module.exports = {
  OPEN_STATUSES,
  IN_PROGRESS_STATUSES,
  openIncident,
  transition,
};
