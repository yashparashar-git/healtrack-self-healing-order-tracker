# HealTrack — Self-Healing Order Tracking System

HealTrack is a MERN-stack delivery tracking application designed to demonstrate failure detection, incident monitoring, automated recovery, and recovery verification.

The system combines order tracking with a reliability dashboard and controlled chaos testing to demonstrate how software can respond to common runtime and external-service failures.

## Key Features

- **Order Tracking:** Create and monitor delivery orders.
- **Live Rider Tracking:** Display rider location updates on a map.
- **Route Visualization:** Show pickup, destination, and delivery routes using Leaflet and OpenStreetMap.
- **Failure Detection:** Detect supported failures and record incidents.
- **Chaos Testing:** Inject controlled failures to test system reliability.
- **Self-Healing:** Attempt recovery using the mechanisms implemented for each supported failure type.
- **Incident Lifecycle:** Track incidents through detection, diagnosis, recovery, and verification.
- **Reliability Dashboard:** View incident details, recovery status, and available health information.
- **Recovery Verification:** Mark an incident as recovered only when the applicable verification succeeds.

## Technology Stack

**Frontend**
- React
- Vite
- Leaflet
- React Leaflet

**Backend**
- Node.js
- Express.js
- MongoDB
- Mongoose

**Mapping and Routing**
- Leaflet
- OpenStreetMap
- OSRM routing service

## How Chaos Testing Works

Chaos testing deliberately introduces a controlled failure so the application's recovery behavior can be observed.

1. Open the application and demonstrate a working order or route.
2. Open the Chaos Lab or the relevant failure-testing control.
3. Inject a supported failure.
4. Observe the failure and the incident recorded by the system.
5. Trigger recovery if the selected mechanism requires a manual recovery action.
6. Check the service or order again.
7. Confirm whether verification succeeds and the incident status changes to `recovered`.

Only use the failure controls exposed by the application. Do not run destructive experiments against production data or a production service.

## How Self-Healing Works

The general self-healing workflow is:

**Detect → Diagnose → Recover → Verify → Record Result**

- **Detect:** Identify a supported failure condition.
- **Diagnose:** Collect incident details and identify the affected component.
- **Recover:** Execute the recovery action implemented for that incident type.
- **Verify:** Check whether the affected component has returned to a working state.
- **Record Result:** Update the incident with the recovery outcome and verification evidence.

A recovery attempt is not the same as a successful recovery. If verification fails, the incident should remain in an appropriate unsuccessful or degraded state.

### Rider Tracking Recovery

When a supported rider-tracking failure is detected, HealTrack records the incident and attempts to restore tracking using the tracking recovery logic. The result should be verified using fresh location updates and the incident status.

### OSRM Route-Service Recovery

When the external route service becomes unavailable or returns an unusable result, the implemented routing logic can attempt retries and use its configured circuit-breaker or fallback behavior. Recovery must be verified against the application's configured success criteria.

A fallback route can preserve degraded functionality, but it does not necessarily mean the external OSRM service has recovered.

### Database Failure Handling

Database connection recovery and recovery of a failed database operation are different scenarios. The connection may reconnect successfully while an earlier operation still requires a safe retry or further handling.

Test both scenarios separately before describing both as fully recovered.

### Other Failure Types

Recovery support depends on the incident type and the recovery handlers implemented in the current version. A detected incident does not automatically mean that an automatic recovery mechanism exists for it.

Process-level recovery also requires a suitable process supervisor if the Node.js process itself exits.

## Prerequisites

Install the following before running the project:

- Node.js and npm
- Git
- A MongoDB Atlas database or another correctly configured MongoDB connection
- A modern web browser

## Project Structure

```text
healtrack/
├── client/       # React frontend
├── server/       # Express backend
├── README.md
├── .gitignore
└── Documentation and report files
```

The exact structure may include additional folders, scripts, and reports depending on the current implementation.

## Environment Configuration

Keep credentials in local environment files. Never commit real passwords, API keys, or database connection strings.

### Backend

Create `server/.env` locally and configure the variables expected by the backend.

For example:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
```

These names are examples. Check the backend source code to confirm the exact environment-variable names required by the current version.

For MongoDB Atlas:

1. Create or select your Atlas cluster.
2. Create a database user.
3. Configure network access for your development machine.
4. Copy the connection string.
5. Put it in the appropriate variable in `server/.env`.
6. Replace any placeholder credentials locally.

Do not paste the real connection string into this README or commit it to GitHub.

### Frontend

If the frontend supports a configurable API URL, create `client/.env` locally:

```env
VITE_API_URL=http://localhost:5000
```

Confirm that the frontend reads `VITE_API_URL` before using this setting. Vite exposes variables prefixed with `VITE_` to client-side code, so never store secrets in them.

## Installation and Startup

Open two terminal windows.

### 1. Start the backend

```powershell
cd server
npm install
npm start
```

If the project does not define a `start` script, inspect `server/package.json` and use the script that is actually available, such as `npm run dev`.

Make sure the backend environment variables are configured before starting it.

### 2. Start the frontend

In a second terminal:

```powershell
cd client
npm install
npm run dev
```

Open the local URL printed by Vite in the terminal.

If the frontend cannot connect to the backend, verify the backend port, API URL, and browser console errors.

## Demo Workflow

For a live demonstration:

1. Create or open a delivery order.
2. Show the rider and delivery route.
3. Inject a supported failure through the Chaos Lab.
4. Show the detected incident in the reliability dashboard.
5. Trigger recovery if required by that mechanism.
6. Observe the recovery attempt.
7. Verify the result using the relevant service state, fresh tracking updates, or route checks.
8. Show the final incident status and recovery evidence.

Use actual dashboard results and recorded timings in the demonstration. Do not claim a recovery time or success that has not been measured and verified.

## Security Notes

- Never commit `.env` files or credentials.
- Keep `node_modules` out of version control.
- Use placeholders in example configuration files.
- Restrict chaos-testing controls to an appropriate development environment.
- Avoid destructive chaos experiments against production services or data.
- Review staged files before every commit.

## Current Project Status

Rider tracking and OSRM routing have been demonstrated in the current development environment. Database recovery has also been reported as working.

The behavior of every other failure type should be validated against the current implementation before being described as supported. Recovery times and success rates should be based on actual incident logs or test results.

## Author

**Yash Parashar**

GitHub: [yashparashar-git](https://github.com/yashparashar-git)
