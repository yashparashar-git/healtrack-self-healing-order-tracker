const mongoose = require("mongoose");

// Test-only documents written by the database Chaos Lab scenario.
// They never touch orders/incidents and expire automatically after 24h.
const reliabilityProbeSchema = new mongoose.Schema({
  runId: { type: String, required: true },
  token: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
});

module.exports = mongoose.model("ReliabilityProbe", reliabilityProbeSchema);
