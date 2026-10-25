const mongoose = require("mongoose");

// One persisted record per Chaos Lab test run.
const chaosRunSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, unique: true },
    scenario: { type: String, required: true },
    params: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    status: {
      type: String,
      enum: ["RUNNING", "PASSED", "DEGRADED", "FAILED", "BLOCKED"],
      default: "RUNNING",
    },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    incidentId: { type: mongoose.Schema.Types.ObjectId, ref: "Incident", default: null },
    injectedFault: { type: String, default: "" },
    expected: { type: String, default: "" },
    observed: { type: String, default: "" },
    evidence: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    steps: {
      type: [
        new mongoose.Schema(
          { at: { type: Date, default: Date.now }, message: String },
          { _id: false }
        ),
      ],
      default: [],
    },
    triggeredBy: { type: String, default: "local operator" },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("ChaosRun", chaosRunSchema);
