# HealTrack — Chaos Lab & Self-Healing Portal

This document covers the reliability features added on top of the existing order-tracking app: what was found, what changed, how to run it, the API, the test report, and a demo script.

---

## 1. Repository audit (before this change)

| Area | State found | Notes |
|---|---|---|
| Order creation, Nominatim search, OSRM road route | **Working** | Kept unchanged. |
| OSRM retry + circuit breaker + cached fallback | **Working, partial** | Incidents were created in `recovering` and only flipped to `recovered`/`failed`; no timeline, no verification record. |
| Rider simulation | **Working, partial** | Timers lived in a route-file `Map`; lost on restart; progress kept in a closure variable, not the DB. |
| Map, status timeline, Delivery console | **Working** | Kept; tracking state now comes from the backend. |
| `/reliability` console | **Broken / unreachable** | Route commented out; it called `/chaos/test-route` with no body (always 400). |
| `configureRoutingChaos` | **Broken** | A copy of the function was nested inside itself; outer function returned `undefined`. |
| Stale-location detection, tracking recovery | **Missing** | |
| DB-fault, invalid-data scenarios | **Missing** | |
| Chaos endpoints access control | **Missing** | Anyone could switch OSRM into permanent failure. |
| Crash demo | **Partial** | Endpoint existed; startup marked any `recovering` crash incident `recovered` without a health check. PM2 not installed. |
| `services/selfHealing.js` | **Unused legacy** | Simulated "routing-service"; left untouched. It produced 17 incidents still in `recovering` (Oct 16–17) that nothing can resolve. |
| Secrets | **Risk** | The git repository root is `E:/` (whole drive), not `healtrack/`; there was no project `.gitignore`, so `server/.env` was not ignored. It was not tracked. |

---

## 2. What changed

### End-to-end flow
`Chaos Lab click → POST /api/chaos/runs → bounded backend fault → detection (monitor or the affected code path) → one Incident document moves detected → diagnosing → recovering → verifying → recovered | degraded | failed → Chaos run records evidence and PASSED / DEGRADED / FAILED / BLOCKED → Portal and Delivery console read the same records.`

`recovered` cannot be written without `verification.passed === true` (enforced in `incidentLifecycle.transition`).

### Files

**Server — new**
| File | Purpose |
|---|---|
| `src/services/incidentLifecycle.js` | `openIncident` / `transition`: one stable incident ID, timeline entries, actions, retries, verification; computes TTD/TTR. |
| `src/services/faultInjector.js` | In-memory, bounded (≤60 s) test-only faults: tracking (`stuck_worker`, `device_offline`) and DB (`failCount` ≤ 5). `guardedDbOp` throws *before* MongoDB is contacted. |
| `src/services/riderSimulation.js` | Rider workers moved out of the route file. Progress read from/persisted to the DB each tick, idempotent start, worker generations, `restartWorker`, `resumeActiveSimulations` after restart, `lastSuccessfulLocationAt`. |
| `src/services/trackingHealer.js` | Staleness monitor (every 2 s, threshold 7.5 s), rule-based diagnosis, bounded restart/backoff recovery with read-back verification, degraded handling, invalid-data rejection + deduplicated incidents, customer tracking state. |
| `src/services/chaosRunner.js` | Five scenarios, one-run-at-a-time lock, persisted run records, crash verification after restart. |
| `src/routes/chaosRoutes.js` | `/api/chaos/*` API. |
| `src/middleware/chaosGuard.js` | Disabled unless `ENABLE_CHAOS_LAB=true`; never in `NODE_ENV=production`; loopback only; optional `CHAOS_TOKEN`. |
| `src/models/ChaosRun.js`, `src/models/ReliabilityProbe.js` | Run history; test-only probe docs (TTL 24 h). |
| `ecosystem.config.js`, `scripts/smoke-test.js`, `.env.example` | PM2 config, end-to-end smoke test, env template. |

**Server — modified**
| File | Change |
|---|---|
| `src/models/Incident.js` | Added `verifying`, `degraded` statuses and fields `scenario, runId, orderId, faultStartedAt, rootCause, evidence, timeline, actions, retryCount, verification, resolvedAt`. **Backward compatible**: existing fields/values unchanged, new fields have defaults, no migration needed. |
| `src/models/Order.js` | Added `tracking { simulationActive, lastSuccessfulLocationAt, lastError, lastErrorAt, consecutiveFailures }` with defaults. |
| `src/services/osrmService.js` | Fixed the nested `configureRoutingChaos`; outages auto-expire; incidents use the lifecycle (fallback ⇒ `degraded`, probe success ⇒ `verifying` → `recovered`); exposes last probe. Retry/circuit logic unchanged. |
| `src/routes/orderRoutes.js` | Simulation start/stop use `riderSimulation`; `PATCH /:id/location` goes through validation + incident recording; `/tracking/:id` adds a `tracking` object. Response shapes otherwise unchanged. |
| `src/routes/reliabilityRoutes.js` | Overview adds DB ping, routing/tracking/healing-engine/supervisor status and real metrics; new `/tracking`, `/chaos-history`; legacy chaos endpoints now guarded. |
| `src/server.js` | Mounts `/api/chaos`; JSON error handler; after listen: verify crash incidents, close interrupted runs, resume riders, start monitor. `/api/demo/crash` now goes through the guarded runner. |
| `package.json` | `pm2` devDependency; `pm2:*` and `test:smoke` scripts. |

**Client — new:** `src/pages/ChaosLab.jsx`, `src/pages/SelfHealingPortal.jsx`, `src/pages/healing.css`, `src/components/ConsoleNav.jsx`, `src/components/IncidentLifecycle.jsx`, `src/lib/api.js`.
**Client — modified:** `App.jsx` (routes `/chaos`, `/healing`; `/reliability` and `/dashboard` redirect to `/healing`), `Navbar.jsx` (links), `DeliveryConsole.jsx` (shared nav, backend tracking state incl. RECONNECTING/RECOVERED, customer notice, last confirmed time, real links instead of "Soon").
`ReliabilityConsole.jsx` is left in place but no longer routed.

**Root:** `.gitignore` (ignores `.env*` except `.env.example`, `node_modules`, `dist`, logs), `.claude/launch.json` (client on port 5174).

---

## 3. Run it (Windows PowerShell)

Requires Node.js 18+ (tested on 22). `<project>` = the folder that contains `server` and `client`.

```powershell
# one-time
cd <project>\server; npm install
cd <project>\client; npm install
```

`server/.env` needs (see `.env.example`): `MONGODB_URI`, `PORT=5000`, `NODE_ENV=development`, `ENABLE_CHAOS_LAB=true`, `ENABLE_CRASH_DEMO=true`.

```powershell
# API under PM2 (required for the crash scenario)
cd <project>\server; npm run pm2:start
npm run pm2:logs      # follow logs
npm run pm2:stop      # stop and remove the process

# or without PM2 (crash scenario reports BLOCKED)
npm start

# Frontend
cd <project>\client; npm run dev -- --port 5174
# open http://localhost:5174/console, /chaos, /healing

# Tests (API must be running)
cd <project>\server; npm run test:smoke            # ~40 s
npm run test:smoke -- --osrm                                                   # + OSRM outage (~55 s)
npm run test:smoke -- --negative                                               # + exhausted-retry case (adds a FAILED incident)
npm run demo:reset                                                             # dry run: list test data
npm run demo:reset -- --confirm                                                # back up + remove test data (stop the API first)
cd <project>\client; npm run build
```

---

## 4. API reference (added / changed)

All responses are JSON `{ success: boolean, ... }`. Errors: `{ success: false, message }` with 400 (validation), 401 (bad `x-chaos-token`), 403 (Chaos Lab disabled / non-localhost), 404, 409 (another run active), 500 (no stack traces).
**Guarded** = requires `ENABLE_CHAOS_LAB=true`, `NODE_ENV≠production`, a loopback client, and `x-chaos-token` if `CHAOS_TOKEN` is set.

### Chaos Lab
| Method & path | Guard | Body | Response |
|---|---|---|---|
| `GET /api/chaos/status` | — | — | `{ enabled, reason, activeRun, faults:{tracking[],db}, routing, crashDemo:{available,reason}, supervised }` |
| `GET /api/chaos/scenarios` | — | — | `{ scenarios:[{ id,name,description,risk,requiresOrder,params,expected,available,unavailableReason }] }` |
| `GET /api/chaos/targets` | — | — | `{ targets:[{ id,orderNumber,customerName,status,routeProgress,routePoints,simulationRunning }] }` |
| `GET /api/chaos/runs?limit=25` | — | — | `{ runs:[ChaosRun] }` |
| `GET /api/chaos/runs/:runId` | — | — | `{ run }` |
| `POST /api/chaos/runs` | **Guarded** | `{ scenario, orderId?, params? }` | `202 { run }` (status `RUNNING`; poll `/runs/:runId`) |
| `POST /api/chaos/reset` | **Guarded** | — | Clears all armed faults; keeps incidents/runs. |

Scenarios and params (values are clamped server-side):

| `scenario` | `orderId` | `params` |
|---|---|---|
| `rider_tracking` | required, rider must be moving (else BLOCKED) | `mode: "stuck_worker" \| "device_offline"`, `durationMs` 5000–30000 (device_offline) |
| `osrm_outage` | optional (uses its destination) | `durationMs` 3000–20000 |
| `db_failure` | — | `failCount` 1–5 (4 attempts max ⇒ 4–5 gives FAILED) |
| `invalid_tracking_data` | required | — |
| `process_crash` | — | — (BLOCKED unless under PM2 and `ENABLE_CRASH_DEMO=true`) |

`ChaosRun`: `{ runId, scenario, params, status: RUNNING|PASSED|DEGRADED|FAILED|BLOCKED, orderId, incidentId, injectedFault, expected, observed, evidence, steps:[{at,message}], triggeredBy, startedAt, finishedAt, durationMs }`.

Example:
```powershell
$body = '{"scenario":"rider_tracking","orderId":"<ORDER_ID>","params":{"mode":"stuck_worker"}}'
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/chaos/runs -ContentType 'application/json' -Body $body
Invoke-RestMethod http://localhost:5000/api/chaos/runs/<RUN_ID>
```

### Reliability
| Method & path | Notes |
|---|---|
| `GET /api/reliability/overview` | `services.{api, database, databaseLatencyMs, routing, tracking, healingEngine, supervisor, chaosLab}`, `circuit`, `metrics.{totalIncidents, activeIncidents, successfulRecoveries, degradedIncidents, failedIncidents, byStatus, successRate, avgTtdMs, avgTtrMs, totalRetries, definitions}`. Old fields (`routingCircuit`, `selfHealingCircuit`, `recoveryRate`) kept. |
| `GET /api/reliability/incidents?limit=100` | Newest first; now includes timeline/actions/verification. |
| `GET /api/reliability/incidents/:id` | Unchanged shape + new fields. |
| `GET /api/reliability/tracking` | Active/recent riders: location, progress, worker, `tracking` state. |
| `GET /api/reliability/chaos-history` | Last 20 runs. |
| `POST /api/reliability/chaos/config`, `/routing/chaos/config`, `/chaos/test-route`, `/routing/test-route` | Unchanged behaviour, now **Guarded**; `failureMode:"always"` auto-expires (`durationMs`, default 30 s). |

### Orders (changed parts only)
* `GET /api/orders/tracking/:id` adds `tracking: { state: LIVE|STALE|RECONNECTING|RECOVERED|PAUSED|UNAVAILABLE|DELIVERED, lastSuccessfulLocationAt, locationAgeMs, staleAfterMs, workerRunning, lastError, lastErrorAt, consecutiveFailures, incident|null }`.
* `PATCH /api/orders/:id/location` — invalid coordinates → `400 { message, incidentId }`; stored location untouched.
* `POST /api/demo/crash` — **Guarded**; starts the `process_crash` run.

### Metric definitions
* **TTD** = `detectedAt − faultStartedAt` (first missed update = last confirmed write + 3 s interval; or first failed call).
* **TTR** = `recoveredAt − detectedAt`, only when verification passed.
* **Success rate** = recovered / (recovered + degraded + failed); in-progress excluded; `null` when nothing is resolved.

---

## 5. Test report (run on 2026-10-23 against MongoDB Atlas + public OSRM)

| # | Test | Result | Evidence |
|---|---|---|---|
| 1 | API startup, `/api/health` | **PASS** | 200 healthy, DB connected. |
| 2 | Create order + OSRM route | **PASS** | 40 sampled points via `osrm`. |
| 3 | Rider simulation start is idempotent | **PASS** | Second start → "already running". |
| 4 | Tracking state LIVE with confirmed timestamp | **PASS** | `state: LIVE`. |
| 5 | Rider tracking — stuck worker | **PASS** | Incident `6adb613f…ab1e`: TTD 5306 ms, TTR 4690 ms, 1 attempt, progress 1→2 verified. Tracking state LIVE → RECONNECTING → RECOVERED → LIVE observed via API. Repeated in smoke test (TTD 5546, TTR 3752) and from the UI (TTD 6463 ms). |
| 6 | Rider tracking — device offline 14 s | **PASS** | Incident `6adb6170…ab20`: TTD 4883 ms, 2 restart attempts (retryCount 1), TTR 13377 ms; last valid location preserved during fault. |
| 7 | OSRM outage 5 s | **PASS** | Incident `6adb61a4…ab24`: 3 failed attempts → circuit OPEN → cache served (DEGRADED); next request attempts=0 (short-circuit); after cooldown half-open probe → live 93-point route, circuit CLOSED, same incident RECOVERED, TTR 12509 ms. |
| 8 | DB failure, 2 injected errors | **PASS** | Incident `6adb610e…ab17`: attempts 1–2 failed, 3 succeeded, read-after-write verified, retryCount 2, TTR 2279 ms. |
| 9 | DB failure, 5 injected errors | **PASS (expected FAILED)** | All 4 attempts failed → incident FAILED, nothing written. |
| 10 | Invalid tracking data | **PASS** | 4 payloads rejected (400); location/progress preserved; one incident `6adb6188…ab22` verified; a later manual bad PATCH was deduplicated into the same incident (5 rejections recorded). |
| 11 | Process crash under PM2 | **PASS** | pid 1640 → 12804; health back after ~4.9 s client-side; incident TTR 5096 ms; run PASSED. |
| 12 | Rider resumes after restart | **PASS** | Order progress 2 before crash → 4 after restart, `simulationRunning: true`, no false stale incident (grace period). |
| 13 | Incident history survives restart | **PASS** | All incidents/runs present after the PM2 restart. |
| 14 | Malformed JSON body | **PASS** | 400 `{"message":"Malformed request body"}`, no stack. |
| 15 | Chaos guard | **PASS** | Unit check: disabled → 403, production → 403, non-loopback → 403, missing token → 401, valid token/loopback → allowed. |
| 16 | Frontend build | **PASS** | `vite build` succeeded. ESLint clean on all new files. |
| 17 | UI: Chaos Lab button → backend run → lifecycle | **PASS** | Clicked "Inject fault & run" in the browser; run CR-MVL0NKB0-FB50 PASSED; portal and Delivery console showed the same incident and "Live tracking restored … verified". No console errors. |
| 18 | Smoke test (`npm run test:smoke -- --osrm`) | **PASS** | 12/12 checks. |

**Not tested / blocked**
* Tracking **DEGRADED** path: the maximum bounded device-offline window (30 s) is shorter than the three recovery attempts (~26 s + detection), so it normally recovers on attempt 3. The degraded branch is reachable when a real device stays offline; not exercised.
* OSRM **DEGRADED** outcome (probe fails because real OSRM is down) — not exercised; it requires the public OSRM to be down.
* Pre-existing ESLint errors in `DeliveryConsole.jsx` (`Date.now()` in `useState`, `setState` in the suggestions effect) were already present and were not changed.
* No automated unit-test framework exists in the repo; testing is the API smoke test plus the manual runs above.

---

## 6. User guide

**Chaos Lab (`/chaos`)**
1. Step 1: pick a scenario. Each card states what is injected.
2. Step 2: choose the target order (defaults to the newest order whose rider is moving), adjust bounded params, read *Risk / scope* and *Expected*.
3. Click **Inject fault & run**. Controls lock while a run is active (one run at a time). **Run again** repeats the same configuration. **Clear all faults** disarms every fault immediately (incidents are kept).
4. Step 3 shows the run ID, injected fault, the linked incident's lifecycle read from the database, TTD/TTR/retries, every run step, and the final PASSED / DEGRADED / FAILED / BLOCKED with the observed result. "Open in Self-Healing Portal" jumps to the same incident.
5. *Armed faults* (right) shows the routing wrapper, circuit, tracking/DB faults and supervisor.

**Self-Healing Portal (`/healing`)** — polls every 2.5 s.
* Metrics: totals, active, recovered (verified only), degraded/failed, success rate, average TTD/TTR, total retries. Definitions at the bottom.
* Incidents: filter by state; click a row for lifecycle strip with offsets, root-cause hypothesis, verification (passed / not passed), recovery actions, timeline, raw evidence. Incidents without a timeline are marked *legacy*.
* System health: API, MongoDB ping, routing, rider tracking, healing engine, supervisor. When the API is unreachable everything shows **unknown** and a red banner — never green.
* Circuit breaker, Rider tracking table, Chaos Lab history.
* Toasts fire once per incident+status transition (deduplicated).

**Delivery console (`/console`)** shows the backend tracking state: Rider live / Last known location (stale) / Reconnecting tracking / Tracking restored / Paused / Unavailable, the last confirmed location time, and a customer notice while an incident is open or just recovered.

---

## 7. Demo / camera script (~4 min)

Prep: `npm run pm2:start` (server), `npm run dev -- --port 5174` (client). Create one order in advance if internet is slow.

1. **Delivery console** `/console` — create an order (or load one), click **Start rider**. Show the moving marker and "Rider live, Xs ago".
   *Say:* "Every position is validated and stored with a confirmed timestamp."
2. **Chaos Lab** `/chaos` — select *Rider tracking failure*, mode `stuck_worker`, target = that order. Click **Inject fault & run**. Point at the run ID.
3. Wait ~7 s: the lifecycle strip turns DETECTED → DIAGNOSING → RECOVERING. Click **Open in Self-Healing Portal**.
4. **Portal** — same incident ID. Show root cause ("worker ticking but no updates"), action `restart_worker`, then VERIFYING → RECOVERED with the verification line (fresh timestamp, coordinates, progress n → n+1). Point at TTD/TTR.
5. Back on **Delivery console** — the notice "Live tracking restored at … verified"; the marker continues from the same point (no reset).
6. **Chaos Lab** — *OSRM routing outage*, 5000 ms, **Inject**. Narrate steps: 3 retries, circuit OPEN, cached route (DEGRADED — "we never call it recovered here"), request skipped while OPEN, half-open probe → CLOSED → RECOVERED.
7. Optional: *Database write failure* (failCount 2 → PASSED; 5 → FAILED, "honest failure").
8. Optional: *API process crash* — click Inject; the page keeps polling; ~5 s later the run shows PASSED with old → new pid. Mention: "PM2 restarts the process; on boot the API checks MongoDB and its own health before marking recovered, and resumes the rider."
9. Portal metrics: success rate, average TTD/TTR — "all computed from stored incidents."

**Troubleshooting**
* "Chaos Lab disabled" → set `ENABLE_CHAOS_LAB=true` in `server/.env`, restart.
* Rider scenario BLOCKED → the rider is not moving; click Start rider first.
* OSRM scenario BLOCKED → real OSRM unreachable before injection (internet), or circuit not CLOSED yet (wait 10 s).
* Crash BLOCKED → started with `npm start` instead of `npm run pm2:start`.
* Port 5173 on this machine is used by a different project; use 5174 for HealTrack.

---

## 8. Known limitations & next steps
* Diagnosis is **rule-based** (no AI). Chaos labels (`source: chaos_lab`, `runId`) come from the fault registry, but detection/diagnosis use observed evidence only.
* Faults and circuit state are in memory, single-process. A restart clears armed faults (by design) and the route cache.
* The rider is simulated; the backend cannot obtain real GPS when a device stops sending.
* The DB scenario only targets the probe collection; tracking writes can be guarded (`tracking-location-write`) but no scenario arms that yet.
* Access control is localhost + flag (+ optional token); there is no user authentication in the app.
* All 25 incidents from the retired `selfHealing.js` simulator (service `routing-service`, Oct 16–17) were deleted on 2026-10-23; backup in `server/backups/legacy-routing-service-incidents.json`. Two false DEGRADED incidents caused by a stop/monitor race (fixed) were also removed; backup in `server/backups/false-stop-race-incidents.json`.
* Next: Jest/Supertest unit tests for `incidentLifecycle` and `faultInjector`; a tracking-write DB scenario; Nominatim failure scenario.
