
// const express = require("express");
// const mongoose = require("mongoose");
// const cors = require("cors");
// require("dotenv").config();

// const orderRoutes = require("./routes/orderRoutes");
// const reliabilityRoutes = require("./routes/reliabilityRoutes");

// const app = express();

// app.use(cors());
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// app.get("/", (req, res) => {
//   res.json({
//     message: "HealTrack API is running",
//   });
// });

// app.get("/api/health", (req, res) => {
//   const connected = mongoose.connection.readyState === 1;

//   res.status(connected ? 200 : 503).json({
//     status: connected ? "healthy" : "not_ready",
//     service: "HealTrack API",
//     database: connected ? "connected" : "disconnected",
//     timestamp: new Date().toISOString(),
//     uptimeSeconds: Math.floor(process.uptime()),
//   });
// });

// app.use("/api/orders", orderRoutes);
// app.use("/api/reliability", reliabilityRoutes);


// async function startServer() {
//   const mongoUri = process.env.MONGODB_URI;

//   if (!mongoUri) {
//     console.error("MONGODB_URI is missing from .env");
//     process.exit(1);
//   }

//   try {
//     await mongoose.connect(mongoUri, {
//       serverSelectionTimeoutMS: 5000,
//     });

//     console.log("MongoDB Atlas connected successfully");

//     const PORT = process.env.PORT || 5000;
//     if (process.env.ENABLE_CRASH_DEMO === "true") {
//   app.post("/api/demo/crash", (req, res) => {
//     console.log("CRASH DEMO: Intentional process exit triggered");

//     res.status(202).json({
//       success: true,
//       message: "Crash simulation triggered"
//     });

//     setTimeout(() => {
//       process.exit(1);
//     }, 300);
//   });
// }

//     // app.listen(PORT, () => {
//     //   console.log(`HealTrack API running at http://localhost:${PORT}`);
//     // });
//     const server = app.listen(PORT, "127.0.0.1", () => {
//   console.log(`HealTrack API listening at http://127.0.0.1:${PORT}`);
// });

// server.on("error", (error) => {
//   console.error("HTTP SERVER ERROR:", error.message);
// });
//   } catch (error) {
//     console.error("MongoDB connection failed:", error.message);
//     process.exit(1);
//   }
// }

// startServer();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config({ quiet: true });

const orderRoutes = require("./routes/orderRoutes");
const reliabilityRoutes = require("./routes/reliabilityRoutes");
const chaosRoutes = require("./routes/chaosRoutes");
const { resumeActiveSimulations } = require("./services/riderSimulation");
const { startMonitor } = require("./services/trackingHealer");
const { finalizeAfterStartup, isSupervised, startRun } = require("./services/chaosRunner");
const { chaosEnabled, requireChaosAccess } = require("./middleware/chaosGuard");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({ message: "HealTrack API is running" });
});

app.get("/api/health", (req, res) => {
  const connected = mongoose.connection.readyState === 1;

  res.status(connected ? 200 : 503).json({
    status: connected ? "healthy" : "not_ready",
    service: "HealTrack API",
    database: connected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    pid: process.pid,
    supervisor: isSupervised() ? "pm2" : "none",
  });
});

app.use("/api/orders", orderRoutes);
app.use("/api/reliability", reliabilityRoutes);
app.use("/api/chaos", chaosRoutes);

// Previous crash-demo endpoint, now routed through the Chaos Lab runner so
// the crash is persisted, guarded and verified after the restart.
app.post("/api/demo/crash", requireChaosAccess, async (req, res) => {
  try {
    const run = await startRun({ scenario: "process_crash", triggeredBy: "legacy /api/demo/crash" });
    res.status(202).json({ success: true, message: "Crash run started", runId: run.runId });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// Malformed JSON and other unexpected errors return safe JSON, no stack.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || error.statusCode || 500;
  if (status >= 500) console.error("Unhandled error:", error);
  return res.status(status).json({
    success: false,
    message: status === 400 ? "Malformed request body" : "Internal server error",
  });
});

async function startServer() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.error("MONGODB_URI is missing from .env");
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log("MongoDB Atlas connected successfully");

    const PORT = Number(process.env.PORT) || 5000;

    const server = app.listen(PORT, "127.0.0.1", async () => {
      console.log(`HealTrack API listening at http://127.0.0.1:${PORT}`);
      console.log(
        `Chaos Lab: ${chaosEnabled().enabled ? "enabled (localhost only)" : "disabled"}; supervisor: ${isSupervised() ? "PM2" : "none"}`
      );

      try {
        // Verify crash incidents from a previous process and close
        // interrupted Chaos Lab runs.
        const verified = await finalizeAfterStartup({ port: PORT });
        if (verified > 0) console.log(`Verified ${verified} crash incident(s) after restart`);

        // Resume rider workers that were running before the restart.
        const resumed = await resumeActiveSimulations();
        if (resumed.length) console.log(`Resumed ${resumed.length} rider simulation(s)`);
      } catch (error) {
        console.error("Startup recovery error:", error.message);
      }

      startMonitor();
    });

    server.on("error", (error) => {
      console.error("HTTP SERVER ERROR:", error.message);
      if (error.code === "EADDRINUSE") {
        console.error(
          `Port ${PORT} is already in use. Stop the other HealTrack API (npm run pm2:stop, or close the other terminal) and start again.`
        );
        process.exit(1);
      }
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

startServer();
