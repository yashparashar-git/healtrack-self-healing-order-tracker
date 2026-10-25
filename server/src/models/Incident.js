
const mongoose = require("mongoose");

// Lifecycle: detected -> diagnosing -> recovering -> verifying -> recovered,
// or degraded / failed. Statuses are stored lowercase so incidents written
// by earlier versions (detected/diagnosing/recovering/recovered/failed)
// remain valid without a migration.
const INCIDENT_STATUSES = [
  "detected",
  "diagnosing",
  "recovering",
  "verifying",
  "recovered",
  "degraded",
  "failed",
];

const timelineEntrySchema = new mongoose.Schema(
  {
    status: { type: String, enum: INCIDENT_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const actionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    at: { type: Date, default: Date.now },
    ok: { type: Boolean, default: null },
    detail: { type: String, default: "" },
  },
  { _id: false }
);

const incidentSchema = new mongoose.Schema(
  {
    incidentType: {
      type: String,
      required: true,
    },
    service: {
      type: String,
      required: true,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    status: {
      type: String,
      enum: INCIDENT_STATUSES,
      default: "detected",
    },
    diagnosis: {
      type: String,
      default: "Diagnosis pending",
    },
    recoveryAction: {
      type: String,
      default: "Pending",
    },
    detectedAt: {
      type: Date,
      default: Date.now,
    },
    recoveredAt: {
      type: Date,
      default: null,
    },
    // detectionTimeMs = detectedAt - faultStartedAt (time to detect)
    detectionTimeMs: {
      type: Number,
      default: null,
    },
    // recoveryTimeMs = recoveredAt - detectedAt (time to recover, verified)
    recoveryTimeMs: {
      type: Number,
      default: null,
    },
    source: {
      type: String,
      enum: ["monitor", "chaos_lab", "system"],
      default: "system",
    },
    routeKey: {
      type: String,
      default: null,
    },

    // Fields added for the Chaos Lab / Self-Healing Portal workflow.
    scenario: { type: String, default: null },
    runId: { type: String, default: null, index: true },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    faultStartedAt: { type: Date, default: null },
    rootCause: { type: String, default: null },
    evidence: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    timeline: { type: [timelineEntrySchema], default: [] },
    actions: { type: [actionSchema], default: [] },
    retryCount: { type: Number, default: 0, min: 0 },
    verification: {
      passed: { type: Boolean, default: null },
      at: { type: Date, default: null },
      detail: { type: String, default: "" },
    },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("Incident", incidentSchema);
module.exports.INCIDENT_STATUSES = INCIDENT_STATUSES;
