# HealTrack — Handoff Report

A plain-language guide to what was built, how it works, how to run it, and how to test it while recording.
For full API details and the technical test report, see **RELIABILITY.md**.

---

## 1. In one paragraph

HealTrack already created delivery orders, calculated road routes and moved a simulated rider on a map. Two connected pages were added on top. The **Chaos Lab** (`/chaos`) deliberately breaks one part of the system in a safe, time-limited way. The **Self-Healing Portal** (`/healing`) shows that HealTrack noticed the problem, worked out the cause, fixed it, *checked* the fix, and recorded how long each step took. Everything shown comes from the backend and the database; nothing is faked in the browser. An incident is only marked **RECOVERED** after a real check passes. Otherwise it shows **DEGRADED** or **FAILED**.

---

## 2. What was worked on

### Problems found in the existing project and fixed
| Problem | What was done |
|---|---|
| The old reliability page was not reachable, and its test button always failed (it sent no data). | Replaced by the new Chaos Lab and Self-Healing Portal. `/reliability` and `/dashboard` now open the portal. |
| A routing chaos function was accidentally pasted inside itself. | Fixed; routing outages now switch themselves off after a set time. |
| Rider simulation stopped forever when the server restarted. | Riders now save progress in the database and **resume automatically** after a restart. |
| No detection when the rider's location stopped updating. | A monitor checks every 2 s; a location older than 7.5 s is treated as stale. |
| Anyone could switch routing into permanent failure. | Chaos actions are **off unless enabled**, never run in production, and only accept requests from the same computer. |
| A crash was marked "recovered" on restart without checking anything. | After a restart the API checks MongoDB and its own health first. |
| `.env` (database password) was not protected by `.gitignore`. | `.gitignore` added (ignores `.env`, `node_modules`, builds, logs, backups). |
| Two old lint errors in the Delivery console; browser tab titled "client". | Fixed; tab now says "HealTrack". |

### Problems found during final testing and fixed
* **Stop button false alarm:** clicking *Stop* on a moving rider could create a fake "tracking worker missing" incident, because of a tiny timing gap. Fixed and re-tested.
* **"Run again" refused:** starting a new Chaos Lab run immediately after one finished could be rejected with "another run in progress". Fixed and re-tested with two back-to-back test runs.
* **Port already in use:** if the API was started twice, the second copy stayed half-alive. It now prints a clear message and exits.

### Data clean-up done on the database
* Deleted **25** old incidents created by the retired `selfHealing.js` simulator (service name `routing-service`). They were never real incidents of the current system, and 17 of them were stuck "in progress" forever. Backup: `server/backups/legacy-routing-service-incidents.json`.
* Deleted **2** fake incidents caused by the Stop-button bug above. Backup: `server/backups/false-stop-race-incidents.json`.
* All other history, including real failures, was kept, so the numbers stay honest.

---

## 3. How the app works now

```
Chaos Lab button
  → backend injects a safe, time-limited fault
  → HealTrack detects it  (DETECTED)
  → works out the likely cause from evidence  (DIAGNOSING)
  → runs a fix: restart worker / retry / fallback  (RECOVERING)
  → checks the fix really worked  (VERIFYING)
  → RECOVERED, or honestly DEGRADED / FAILED
  → Portal and Delivery console show the same incident ID and real timings
```

### The five test scenarios
| Scenario | What is broken | What HealTrack does | Expected result |
|---|---|---|---|
| **Rider tracking failure** (`stuck_worker`) | The rider's tracking worker freezes | Detects the stale location, keeps the last good position, restarts the worker, checks a fresh position was saved | PASSED, ~5 s to detect, ~4–5 s to recover |
| **Rider tracking failure** (`device_offline`) | Rider phone "offline" for N seconds | Same as above, retries with back-off until the device is back | PASSED with 1–2 retries |
| **OSRM routing outage** | Route service fails for 5 s | 3 retries → circuit breaker opens → serves saved route (shown as **DEGRADED**, not recovered) → after cooldown tests live routing → RECOVERED | PASSED, ~12 s |
| **Database write failure** | Next 2 database writes fail (test data only) | Retries with back-off, then reads the data back to confirm | PASSED. With 5 failures → **FAILED** (that is the correct, honest result) |
| **Invalid tracking data** | Sends impossible coordinates (lat 999, "abc", etc.) | Rejects them, keeps the last valid location, records one incident | PASSED |
| **API process crash** | Kills the server process | PM2 restarts it, API checks DB + health, rider resumes | PASSED, ~5–6 s downtime |

### Words you will see
* **TTD (time to detect):** from when the problem started to when HealTrack noticed it.
* **TTR (time to recover):** from detection to a *verified* recovery.
* **Success rate:** recovered ÷ (recovered + degraded + failed).
* Customer tracking states: **Rider live**, **Last known location** (stale), **Reconnecting tracking**, **Tracking restored**, **Paused**, **Unavailable**.

---

## 4. Setup on your computer (Windows PowerShell)

Needs **Node.js 18 or newer**. Do not copy `node_modules` folders between computers; reinstall instead.

```powershell
cd <project>\server
npm install
cd <project>\client
npm install
```

`server\.env` must contain (see `server\.env.example`):
```
PORT=5000
MONGODB_URI=<your Atlas connection string>
NODE_ENV=development
ENABLE_CHAOS_LAB=true
ENABLE_CRASH_DEMO=true
```
If `ENABLE_CHAOS_LAB=true` is missing, the Chaos Lab shows "disabled". This is on purpose.
Keep `.env` private. It contains the database password, so don't post it or upload it to a public repo.

### Start (two terminals)
```powershell
# Terminal 1 — API under PM2 (needed for the crash test)
cd <project>\server
npm run pm2:start
npm run pm2:logs        # optional: watch logs

# Terminal 2 — website
cd <project>\client
npm run dev -- --port 5174
```
Open **http://localhost:5174/console**, **/chaos**, **/healing**.

Stop everything afterwards: `npm run pm2:stop` in `server`, and Ctrl+C in the client terminal.

---

## 5. How it was tested

| Check | Result |
|---|---|
| Automated smoke test, `npm run test:smoke -- --osrm --negative` | **12/12 passed**, run again back-to-back **10/10 passed** |
| Crash + PM2 restart | **Passed** (process ID changed, health checked, ~6 s) |
| Rider resumes after restart | **Passed** (progress continued from where it stopped) |
| Stop button no longer creates fake incidents | **Passed** (0 false incidents after repeated stops) |
| Frontend build + lint (whole client) | **Passed**, no errors |
| In the browser: clicked Inject in Chaos Lab → same incident in Portal → "Tracking restored" in Delivery console | **Passed**, no browser console errors |
| Address search in Delivery console | **Passed** |

**Not tested:**
* The DEGRADED outcome for rider tracking. It only happens if a real phone stays offline longer than the recovery attempts.
* The case where the real OSRM website is down during the final check.

The code handles both cases, but neither could be triggered safely.

### Before recording: run this once to make sure everything works
```powershell
cd <project>\server
npm run test:smoke
```
You should see `10/10 checks passed`.

Optional clean slate (removes test orders, Chaos Lab runs and their incidents; real orders are kept; a backup is saved first):
```powershell
npm run pm2:stop
npm run demo:reset               # shows what would be removed
npm run demo:reset -- --confirm  # actually removes it
npm run pm2:start
```

---

## 6. Recording script (about 4 minutes)

**Before you hit record:** both terminals running, and the browser open at `http://localhost:5174/console`.

1. **Delivery console**: create an order (type an address, pick a suggestion, *Create delivery*), then click **Start rider**.
   *Show:* the marker moving and "Rider live, Xs ago". *Say:* "Every position is validated and saved with a confirmed time."
2. **Chaos Lab**: click *Rider tracking failure*, keep mode `stuck_worker`; the target is your moving order. Click **Inject fault & run**.
   *Show:* the run ID (CR-…).
3. Wait about 7 seconds. The lifecycle bar lights up DETECTED → DIAGNOSING → RECOVERING. Click **Open in Self-Healing Portal**.
4. **Portal**: it's the same incident ID.
   *Show:* the root cause ("worker ticking but no updates"), the action `restart_worker`, then VERIFYING → **RECOVERED**, the green verification line (fresh time, coordinates, progress n → n+1), and TTD/TTR.
5. **Delivery console**: the notice "Live tracking restored … verified". The rider continues from the same spot and doesn't jump back to the start.
6. **Chaos Lab**: run *OSRM routing outage* (5000 ms). Read the steps aloud: 3 retries, circuit OPEN, saved route = **DEGRADED** ("we don't call this recovered"), half-open probe, CLOSED, **RECOVERED**.
7. *(Optional)* *Database write failure* with 2 failures → PASSED. With 5 → FAILED, which shows the system reports failures honestly.
8. *(Optional)* *API process crash* → the page keeps waiting → PASSED with old → new process ID.
   *Say:* "PM2 restarts it; the API checks the database and its own health before saying recovered, and the rider resumes."
9. **Portal** top row: success rate and average TTD/TTR. *Say:* "These are calculated from stored incidents, not typed in."

---

## 7. If something goes wrong

| You see | Do this |
|---|---|
| "Chaos Lab disabled" | Add `ENABLE_CHAOS_LAB=true` to `server\.env`, then `npm run pm2:stop` and `npm run pm2:start`. |
| Rider scenario says **BLOCKED** | That rider isn't moving. Click **Start rider** in the Delivery console first. |
| OSRM scenario **BLOCKED** | No internet, or the circuit is still open from a previous test. Wait 10 s and retry. |
| Crash scenario **BLOCKED** | The API was started with `npm start` instead of `npm run pm2:start`. |
| "API offline" in the top bar | The API isn't running. Check `npm run pm2:logs`. |
| "Port 5000 is already in use" in logs | Another copy is running. Run `npm run pm2:stop`, close other API terminals, start again. |
| Page on port 5173 shows a different app | On this machine 5173 is used by another project; use **5174**. |
| A run said "Another Chaos Lab run is in progress" | Wait for the current run to finish; only one test runs at a time on purpose. |

Avoid creating new orders *during* the OSRM outage test. New addresses have no saved route yet, so they fail, as they would in real life.
