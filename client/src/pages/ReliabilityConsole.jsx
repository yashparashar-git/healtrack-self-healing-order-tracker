import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./ReliabilityConsole.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
const RELIABILITY_API = `${API_BASE}/api/reliability`;
const ACTIVE = new Set(["detected", "diagnosing", "recovering"]);

async function request(url, options) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  } catch {
    throw new Error("Cannot reach HealTrack API. Check that the server is running.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(body.message || `Request failed (${response.status})`);
  }
  return body;
}

function timeAgo(value) {
  if (!value) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default function ReliabilityConsole() {
  const [overview, setOverview] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [circuit, setCircuit] = useState(null);
  const [failureMode, setFailureMode] = useState("off");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastResult, setLastResult] = useState(null);
  const seenIncidentIds = useRef(new Set());
  const isFirstLoad = useRef(true);

  const refresh = useCallback(async () => {
    const [summary, incidentList, circuitState] = await Promise.all([
      request(`${RELIABILITY_API}/overview`),
      request(`${RELIABILITY_API}/incidents`),
      request(`${RELIABILITY_API}/chaos/state`),
    ]);
    const nextIncidents = incidentList.incidents || [];
    const newIncidents = nextIncidents.filter((item) => !seenIncidentIds.current.has(item._id));
    if (!isFirstLoad.current && newIncidents.some((item) => ACTIVE.has(item.status))) {
      const incident = newIncidents.find((item) => ACTIVE.has(item.status));
      setNotice(`Incident detected: ${incident.service} — ${incident.diagnosis}`);
    }
    nextIncidents.forEach((item) => seenIncidentIds.current.add(item._id));
    isFirstLoad.current = false;
    setOverview(summary);
    setIncidents(nextIncidents);
    setCircuit(circuitState);
    setFailureMode(circuitState.failureMode || "off");
  }, []);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        await refresh();
        if (mounted) setError("");
      } catch (err) {
        if (mounted) setError(err.message);
      }
    };
    tick();
    const timer = setInterval(tick, 3000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [refresh]);

  async function setMode(mode) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request(`${RELIABILITY_API}/chaos/config`, {
        method: "POST",
        body: JSON.stringify({ failureMode: mode }),
      });
      setFailureMode(mode);
      setCircuit(result.state);
      setNotice(`Chaos mode set to ${mode}. Run the drill to observe detection and recovery.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runDrill({ recover = false } = {}) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (recover) {
        await request(`${RELIABILITY_API}/chaos/config`, {
          method: "POST",
          body: JSON.stringify({ failureMode: "off" }),
        });
        setFailureMode("off");
      }
      const result = await request(`${RELIABILITY_API}/chaos/test-route`, { method: "POST" });
      setLastResult(result);
      setCircuit(result.circuit);
      await refresh();
      if (result.result?.source === "live") {
        setNotice(recover ? "Recovery verified: the routing service returned a live route." : result.result.message);
      } else {
        setNotice("Failure detected. HealTrack served the saved route; recovery is still unconfirmed.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const activeIncidents = incidents.filter((item) => ACTIVE.has(item.status));
  const recoveryRate = overview?.metrics?.recoveryRate ?? 0;

  return (
    <main className="reliability-page">
      <header className="reliability-header">
        <div>
          <Link className="reliability-back" to="/console">← Delivery console</Link>
          <p className="reliability-eyebrow">HEALTRACK / RESILIENCE</p>
          <h1>Self-healing control room</h1>
          <p className="reliability-intro">Inject a controlled routing fault, watch the incident lifecycle, and verify when live routing resumes.</p>
        </div>
        <div className="reliability-live"><span /> Auto-refreshing every 3 seconds</div>
      </header>

      {error && <div className="reliability-banner is-error" role="alert">{error}</div>}
      {notice && <div className="reliability-banner" role="status"><strong>HealTrack update</strong><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notification">×</button></div>}

      <section className="reliability-metrics" aria-label="Reliability summary">
        <Metric label="Total incidents" value={overview?.metrics?.totalIncidents ?? "—"} />
        <Metric label="Active incidents" value={overview?.metrics?.activeIncidents ?? "—"} tone={activeIncidents.length ? "amber" : ""} />
        <Metric label="Recovered" value={overview?.metrics?.successfulRecoveries ?? "—"} tone="green" />
        <Metric label="Recovery rate" value={overview ? `${recoveryRate}%` : "—"} />
      </section>

      <div className="reliability-grid">
        <section className="reliability-card chaos-card">
          <div className="reliability-card-head">
            <div><p className="reliability-eyebrow">CONTROLLED TESTING</p><h2>Chaos Lab</h2></div>
            <span className={`reliability-badge state-${(circuit?.circuitState || "unknown").toLowerCase()}`}>{circuit?.circuitState || "Loading"}</span>
          </div>
          <p className="reliability-muted">Failure modes affect the simulated routing dependency only. Customer orders and rider positions are not changed by this drill.</p>
          <div className="chaos-modes" role="group" aria-label="Routing failure mode">
            {[ ["off", "No failure"], ["once", "Fail once"], ["always", "Keep failing"] ].map(([mode, label]) => (
              <button key={mode} className={`chaos-mode ${failureMode === mode ? "is-selected" : ""}`} onClick={() => setMode(mode)} disabled={busy} aria-pressed={failureMode === mode}>
                <span className="chaos-mode-radio" />{label}
              </button>
            ))}
          </div>
          <div className="chaos-actions">
            <button className="reliability-button primary" onClick={() => runDrill()} disabled={busy}>{busy ? "Working…" : "Run routing failure drill"}</button>
            <button className="reliability-button secondary" onClick={() => runDrill({ recover: true })} disabled={busy || activeIncidents.length === 0}>{busy ? "Working…" : "Approve recovery check"}</button>
          </div>
          <p className="reliability-footnote">Recovery check disables the simulated fault, probes routing, and closes the incident only after a live response.</p>
          <div className="circuit-facts">
            <span>Failure mode <strong>{circuit?.failureMode || failureMode}</strong></span>
            <span>Consecutive failures <strong>{circuit?.consecutiveFailures ?? 0}</strong></span>
            <span>Recovery probe <strong>{circuit?.probeInProgress ? "In progress" : "Idle"}</strong></span>
          </div>
          {lastResult && <div className={`drill-result ${lastResult.result?.source === "live" ? "is-good" : "is-degraded"}`}>
            <strong>{lastResult.result?.source === "live" ? "Live route verified" : "Fallback route active"}</strong>
            <span>{lastResult.result?.message}</span>
            <small>{lastResult.result?.attempts ?? 0} attempts · {lastResult.result?.recoveryTimeMs ?? 0} ms</small>
          </div>}
        </section>

        <section className="reliability-card">
          <div className="reliability-card-head"><div><p className="reliability-eyebrow">SERVICE STATUS</p><h2>System health</h2></div></div>
          <HealthRow name="HealTrack API" value={overview?.services?.api || "Loading"} />
          <HealthRow name="MongoDB" value={overview?.services?.database || "Loading"} />
          <HealthRow name="Routing circuit" value={overview?.services?.routingCircuit || "Loading"} />
          <HealthRow name="Self-healing circuit" value={overview?.services?.selfHealingCircuit || "Loading"} />
          <div className="recovery-steps">
            <p className="reliability-eyebrow">RECOVERY LIFECYCLE</p>
            <ol>
              <li className={lastResult ? "is-done" : ""}>Failure detected and incident recorded</li>
              <li className={lastResult?.result?.source === "fallback" ? "is-done" : ""}>Cached route protects delivery continuity</li>
              <li className={lastResult?.result?.source === "live" ? "is-done" : ""}>Live route response verifies recovery</li>
            </ol>
          </div>
        </section>
      </div>

      <section className="reliability-card incident-card">
        <div className="reliability-card-head">
          <div><p className="reliability-eyebrow">AUDIT TRAIL</p><h2>Incident history</h2></div>
          <span className="reliability-count">{incidents.length} recorded</span>
        </div>
        {incidents.length === 0 ? <p className="reliability-empty">No incidents recorded yet. Run a Chaos Lab drill to see detection, fallback, and recovery here.</p> : (
          <div className="incident-list">
            {incidents.map((incident) => <article className="incident-row" key={incident._id}>
              <div className="incident-status"><span className={`incident-dot status-${incident.status}`} /><div><strong>{incident.incidentType.replaceAll("_", " ")}</strong><small>{incident.service} · {incident.severity} severity</small></div></div>
              <span className={`incident-pill status-${incident.status}`}>{incident.status}</span>
              <div className="incident-diagnosis"><strong>{incident.diagnosis || "Diagnosis pending"}</strong><small>{incident.recoveryAction || "Recovery action pending"}</small></div>
              <div className="incident-time"><strong>{timeAgo(incident.detectedAt)}</strong><small>{incident.recoveryTimeMs == null ? "Recovery time pending" : `${incident.recoveryTimeMs} ms to recover`}</small></div>
            </article>)}
          </div>
        )}
      </section>
      <footer className="reliability-footer"><span>HealTrack AI · Resilience workspace</span><Link to="/">Back to overview</Link></footer>
    </main>
  );
}

function Metric({ label, value, tone = "" }) {
  return <article className={`reliability-metric ${tone ? `tone-${tone}` : ""}`}><span>{label}</span><strong>{value}</strong></article>;
}

function HealthRow({ name, value }) {
  const healthy = ["healthy", "closed"].includes(String(value).toLowerCase());
  const attention = ["open", "unavailable"].includes(String(value).toLowerCase());
  return <div className="health-row"><span>{name}</span><span className={`health-value ${healthy ? "is-good" : attention ? "is-bad" : ""}`}><i />{value}</span></div>;
}
