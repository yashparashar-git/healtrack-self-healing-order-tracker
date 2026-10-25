// Clears data produced by testing so a demo starts from a clean slate.
// Removes ONLY: Chaos Lab runs, Chaos Lab incidents (source chaos_lab / runId),
// reliability probe documents, and orders created by the smoke test or test
// scripts (delivery address ending in "(test)" or "(smoke test)") together
// with their incidents. Real orders and their real incidents are kept.
//
//   npm run demo:reset              dry run: shows what would be removed
//   npm run demo:reset -- --confirm backs everything up to backups/, then removes it
//
// Stop the API first (npm run pm2:stop) so no rider worker is running.
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const confirm = process.argv.includes("--confirm");
const TEST_ADDRESS = /\((smoke )?test\)$/i;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;

  const testOrders = await db.collection("orders").find({ deliveryAddress: TEST_ADDRESS }).toArray();
  const testOrderIds = testOrders.map((order) => order._id);

  const incidentQuery = {
    $or: [{ source: "chaos_lab" }, { runId: { $ne: null } }, { orderId: { $in: testOrderIds } }],
  };
  const incidents = await db.collection("incidents").find(incidentQuery).toArray();
  const runs = await db.collection("chaosruns").find({}).toArray();
  const probes = await db.collection("reliabilityprobes").find({}).toArray();

  console.log(`Test orders:          ${testOrders.length}`);
  console.log(`Test/chaos incidents: ${incidents.length}`);
  console.log(`Chaos Lab runs:       ${runs.length}`);
  console.log(`Probe documents:      ${probes.length}`);

  if (!confirm) {
    console.log("\nDry run only. Re-run with --confirm to back up and remove these.");
    return;
  }

  const dir = path.join(__dirname, "..", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `demo-reset-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify({ testOrders, incidents, runs, probes }, null, 2));
  console.log(`\nBackup written to ${file}`);

  await db.collection("incidents").deleteMany({ _id: { $in: incidents.map((doc) => doc._id) } });
  await db.collection("orders").deleteMany({ _id: { $in: testOrderIds } });
  await db.collection("chaosruns").deleteMany({ _id: { $in: runs.map((doc) => doc._id) } });
  await db.collection("reliabilityprobes").deleteMany({ _id: { $in: probes.map((doc) => doc._id) } });
  console.log("Removed. Real orders and their incidents were not touched.");
}

main()
  .catch((error) => {
    console.error("Reset failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
