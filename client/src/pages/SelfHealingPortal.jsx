import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ConsoleNav from "../components/ConsoleNav";
import { IncidentDetail } from "../components/IncidentLifecycle";
import { clockTime, formatMs, request, statusTone, timeAgo } from "../lib/api";
import "./healing.css";

const POLL_MS = 2500;
const ACTIVE = ["detected", "diagnosing", "recovering", "verifying"];
const FILTERS = {
  all: () => true,
  active: (incident) => ACTIVE.includes(incident.status),
  recovered: (incident) => incident.status === "recovered",
  degraded: (incident) => incident.status === "degraded",
  failed: (incident) => incident.status === "failed",
};

function useHealingPortal() {
  const [overview, setOverview] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [riders, setRiders] = useState([]);
  const [runs, setRuns] = useState([]);
  const [reachable, setReachable] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [toasts, setToasts] = useState([]);
  const seenTransitions = useRef(null);

  const notify = useCallback((list) => {
    // Notifications come from persisted transitions, deduplicated by
    // incident id + status. The first load only seeds what was already seen.
    const keys = list.map((incident) => `${incident._id}:${incident.status}`);
    if (seenTransitions.current === null) {
      seenTransitions.current = new Set(keys);
      return;
    }
    const fresh = list.filter((incident) => !seenTransitions.current.has(`${incident._id}:${incident.status}`));
    keys.forEach((key) => seenTransitions.current.add(key));
    if (fresh.length === 0) return;

    const items = fresh.slice(0, 3).map((incident) => ({
      key: `${incident._id}:${incident.status}`,
      tone: statusTone(incident.status),
      title: `${incident.service}: ${incident.status.toUpperCase()}`,
      text: incident.status === "recovered"
        ? `Recovered and verified in ${formatMs(incident.recoveryTimeMs)}.`
        : incident.timeline?.[incident.timeline.length - 1]?.note || incident.diagnosis,
    }));
    setToasts((current) => [...items, ...current].slice(0, 4));
    items.forEach((item) => setTimeout(() => setToasts((current) => current.filter((t) => t.key !== item.key)), 6000));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [overviewData, incidentData, trackingData, historyData] = await Promise.all([
        request("/api/reliability/overview"),
        request("/api/reliability/incidents?limit=60"),
        request("/api/reliability/tracking"),
        request("/api/reliability/chaos-history"),
      ]);
      setOverview(overviewData);
      setIncidents(incidentData.incidents || []);
      setRiders(trackingData.riders || []);
      setRuns(historyData.runs || []);
      setReachable(true);
      setLastUpdated(Date.now());
      notify(incidentData.incidents || []);
    } catch {
      setReachable(false);
    }
  }, [notify]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  return { overview, incidents, riders, runs, reachable, lastUpdated, toasts };
}

function Metric({ label, value, note, tone = "" }) {
  return (
    <article className={`hl-metric ${tone ? `hl-metric--${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}

function Metrics({ metrics }) {
  const m = metrics || {};
  return (
    <section className="hl-metrics" aria-label="Recovery metrics">
      <Metric label="Total incidents" value={m.totalIncidents ?? "—"} note="persisted in MongoDB" />
      <Metric label="Active" value={m.activeIncidents ?? "—"} note="detecting → verifying" tone={m.activeIncidents ? "warn" : ""} />
      <Metric label="Recovered" value={m.successfulRecoveries ?? "—"} note="verified only" tone="ok" />
      <Metric label="Degraded / failed" value={m.totalIncidents == null ? "—" : `${m.degradedIncidents} / ${m.failedIncidents}`} tone={m.failedIncidents ? "bad" : ""} />
      <Metric label="Success rate" value={m.successRate == null ? "—" : `${m.successRate}%`} note="of resolved incidents" />
      <Metric label="Avg TTD / TTR" value={m.totalIncidents == null ? "—" : `${formatMs(m.avgTtdMs)} / ${formatMs(m.avgTtrMs)}`} note={`${m.totalRetries ?? 0} retries total`} />
    </section>
  );
}

function HealthRow({ name, value, detail, reachable }) {
  const shown = reachable ? value : "unknown";
  return (
    <li>
      <span>{name}<small>{reachable ? detail : "API unreachable — status unknown"}</small></span>
      <span className={`cs-pill cs-pill--sm cs-pill--${reachable ? statusTone(value) : "info"}`}>{shown || "—"}</span>
    </li>
  );
}

function SystemHealth({ services, reachable }) {
  const s = services || {};
  return (
    <section className="cs-card">
      <h2 className="cs-card__title">System health</h2>
      <ul className="hl-health">
        <HealthRow name="HealTrack API" reachable={reachable} value={reachable ? "healthy" : "unreachable"}
          detail={s.supervisor ? `pid ${s.supervisor.pid} · up ${s.supervisor.uptimeSeconds}s` : ""} />
        <HealthRow name="MongoDB" reachable={reachable} value={s.database}
          detail={s.databaseLatencyMs != null ? `ping ${s.databaseLatencyMs} ms` : "no ping"} />
        <HealthRow name="Routing (OSRM)" reachable={reachable} value={s.routing?.status}
          detail={s.routing ? `circuit ${s.routing.circuitState} · chaos ${s.routing.failureMode}` : ""} />
        <HealthRow name="Rider tracking" reachable={reachable} value={s.tracking?.status}
          detail={s.tracking ? `${s.tracking.workersRunning} worker(s) for ${s.tracking.activeDeliveries} active deliver${s.tracking.activeDeliveries === 1 ? "y" : "ies"}` : ""} />
        <HealthRow name="Healing engine" reachable={reachable} value={s.healingEngine?.status}
          detail={s.healingEngine ? `monitor every ${s.healingEngine.intervalMs / 1000}s · last run ${timeAgo(s.healingEngine.lastRunAt)}` : ""} />
        <HealthRow name="Process supervisor" reachable={reachable} value={s.supervisor?.status}
          detail={s.supervisor?.pmId != null ? `PM2 id ${s.supervisor.pmId}` : "not running under PM2"} />
      </ul>
    </section>
  );
}

function CircuitCard({ circuit, reachable }) {
  return (
    <section className="cs-card">
      <div className="cs-card__head">
        <h2 className="cs-card__title">Routing circuit breaker</h2>
        <span className={`cs-pill cs-pill--${reachable ? statusTone(circuit?.circuitState) : "info"}`}>
          <span className="dot" />{reachable ? circuit?.circuitState || "—" : "unknown"}
        </span>
      </div>
      <dl className="hl-kv">
        <div><dt>Consecutive failures</dt><dd>{circuit?.consecutiveFailures ?? "—"}</dd></div>
        <div><dt>Cooldown left</dt><dd>{formatMs(circuit?.cooldownRemainingMs)} / {formatMs(circuit?.cooldownMs)}</dd></div>
        <div><dt>Last half-open probe</dt><dd>{circuit?.lastProbe ? `${circuit.lastProbe.ok ? "succeeded" : "failed"} ${timeAgo(circuit.lastProbe.at)}` : "none yet"}</dd></div>
        <div><dt>Cached routes</dt><dd>{circuit?.cachedRouteCount ?? "—"}</dd></div>
      </dl>
    </section>
  );
}

function IncidentList({ incidents, selectedId, select }) {
  const [filter, setFilter] = useState("all");
  const shown = incidents.filter(FILTERS[filter]);

  return (
    <section className="cs-card">
      <div className="cs-card__head">
        <h2 className="cs-card__title">Incidents</h2>
        <div className="hl-filter" role="group" aria-label="Filter incidents">
          {Object.keys(FILTERS).map((key) => (
            <button key={key} type="button" className={`hl-chip ${filter === key ? "is-on" : ""}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {key} ({incidents.filter(FILTERS[key]).length})
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="hl-empty">No incidents match this filter.</p>
      ) : (
        <div className="hl-table-wrap">
          <table className="hl-table">
            <thead>
              <tr><th>Status</th><th>Service / type</th><th>Detected</th><th>TTD</th><th>TTR</th><th>Retries</th><th>Source</th></tr>
            </thead>
            <tbody>
              {shown.map((incident) => (
                <tr key={incident._id} className={`is-clickable ${selectedId === incident._id ? "is-selected" : ""}`} onClick={() => select(incident._id)}>
                  <td><span className={`cs-pill cs-pill--sm cs-pill--${statusTone(incident.status)}`}>{incident.status}</span></td>
                  <td>
                    {incident.service}
                    <div className="hl-small">{incident.incidentType.replaceAll("_", " ")}{incident.timeline?.length ? "" : " · legacy"}</div>
                  </td>
                  <td className="num">{timeAgo(incident.detectedAt)}</td>
                  <td className="num">{formatMs(incident.detectionTimeMs)}</td>
                  <td className="num">{incident.status === "recovered" ? formatMs(incident.recoveryTimeMs) : "—"}</td>
                  <td className="num">{incident.retryCount ?? 0}</td>
                  <td>{incident.source}{incident.runId && <div className="hl-small hl-mono">{incident.runId}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const TRACK_TONE = { LIVE: "ok", RECOVERED: "ok", DELIVERED: "ok", STALE: "warn", RECONNECTING: "warn", PAUSED: "info", UNAVAILABLE: "bad" };

function RiderPanel({ riders }) {
  return (
    <section className="cs-card">
      <h2 className="cs-card__title">Rider tracking</h2>
      {riders.length === 0 ? (
        <p className="hl-empty">No recent deliveries. Start a rider in the Delivery console.</p>
      ) : (
        <div className="hl-table-wrap">
          <table className="hl-table">
            <thead>
              <tr><th>Order</th><th>State</th><th>Last valid location</th><th>Confirmed</th><th>Progress</th><th>Last error</th></tr>
            </thead>
            <tbody>
              {riders.map((rider) => (
                <tr key={rider.orderId}>
                  <td>…{rider.orderNumber.slice(-8)}<div className="hl-small">{rider.customerName}</div></td>
                  <td><span className={`cs-pill cs-pill--sm cs-pill--${TRACK_TONE[rider.tracking.state] || "info"}`}>{rider.tracking.state}</span></td>
                  <td className="hl-mono">{rider.location.latitude?.toFixed(5)}, {rider.location.longitude?.toFixed(5)}</td>
                  <td className="num">{timeAgo(rider.tracking.lastSuccessfulLocationAt)}</td>
                  <td className="num">{rider.routeProgress} / {Math.max(0, rider.routePoints - 1)}</td>
                  <td className="hl-small">{rider.tracking.lastError ? `${rider.tracking.lastError} (${timeAgo(rider.tracking.lastErrorAt)})` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ChaosHistory({ runs, select }) {
  return (
    <section className="cs-card">
      <div className="cs-card__head">
        <h2 className="cs-card__title">Chaos Lab history</h2>
        <Link className="cs-link" to="/chaos">Open Chaos Lab →</Link>
      </div>
      {runs.length === 0 ? (
        <p className="hl-empty">No Chaos Lab runs yet.</p>
      ) : (
        <ul className="hl-health">
          {runs.slice(0, 8).map((run) => (
            <li key={run.runId}>
              <span>
                {run.scenario} <span className="hl-mono hl-small">{run.runId}</span>
                <small>{clockTime(run.startedAt)} · {run.triggeredBy} · {run.injectedFault}</small>
                {run.incidentId && (
                  <button type="button" className="cs-link" onClick={() => select(String(run.incidentId))}>View incident</button>
                )}
              </span>
              <span className={`cs-pill cs-pill--sm cs-pill--${statusTone(run.status)}`}>{run.status}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function SelfHealingPortal() {
  const p = useHealingPortal();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("incident") || "";
  const [fetched, setFetched] = useState(null);

  const select = useCallback((id) => setSearchParams(id ? { incident: id } : {}), [setSearchParams]);

  // The selected incident comes from the polled list; older ones are fetched.
  const fromList = selectedId ? p.incidents.find((incident) => incident._id === selectedId) : null;
  const selected = fromList || (fetched?._id === selectedId ? fetched : null);

  useEffect(() => {
    if (!selectedId || fromList) return;
    request(`/api/reliability/incidents/${selectedId}`).then((data) => setFetched(data.incident)).catch(() => {});
  }, [selectedId, fromList]);

  const apiState = p.reachable === null ? "checking" : p.reachable ? "online" : "offline";
  const apiLabel = { online: "API connected", offline: "API offline", checking: "Checking API" }[apiState];

  return (
    <>
      <ConsoleNav apiState={apiState} apiLabel={apiLabel} />
      <main className="container cs-page">
        <div className="cs-head hl-head">
          <div>
            <h1>Self-Healing Portal</h1>
            <p>Live health, incidents and verified recoveries, read from the backend every {POLL_MS / 1000} seconds.</p>
          </div>
          <div className="hl-head__meta">
            <span>Updated {p.lastUpdated ? clockTime(p.lastUpdated) : "—"}</span>
            <Link className="btn btn--ghost btn--sm" to="/chaos">Chaos Lab →</Link>
          </div>
        </div>

        {p.reachable === false && (
          <div className="cs-notice cs-notice--bad" role="alert">
            The HealTrack API is unreachable. Showing the last data received{p.lastUpdated ? ` at ${clockTime(p.lastUpdated)}` : ""}; health is unknown until it reconnects.
          </div>
        )}

        <Metrics metrics={p.overview?.metrics} />

        <div className="hl-grid">
          <div className="hl-stack">
            <IncidentList incidents={p.incidents} selectedId={selectedId} select={select} />
            <RiderPanel riders={p.riders} />
          </div>
          <div className="hl-stack">
            <section className="cs-card">
              {selected ? (
                <IncidentDetail incident={selected} />
              ) : (
                <>
                  <h2 className="cs-card__title">Incident detail</h2>
                  <p className="hl-empty">Select an incident to see its lifecycle, evidence, recovery actions and verification.</p>
                </>
              )}
            </section>
            <SystemHealth services={p.overview?.services} reachable={p.reachable !== false && Boolean(p.overview)} />
            <CircuitCard circuit={p.overview?.circuit} reachable={p.reachable !== false && Boolean(p.overview)} />
            <ChaosHistory runs={p.runs} select={select} />
          </div>
        </div>

        {p.overview?.metrics?.definitions && (
          <p className="hl-small" style={{ marginTop: 24 }}>
            TTD: {p.overview.metrics.definitions.ttd} TTR: {p.overview.metrics.definitions.ttr} Success rate: {p.overview.metrics.definitions.successRate}
          </p>
        )}
      </main>

      <div className="hl-toasts" aria-live="polite">
        {p.toasts.map((toast) => (
          <div key={toast.key} className={`hl-toast cs-notice--${toast.tone === "info" ? "ok" : toast.tone}`}>
            <strong>{toast.title}</strong>
            {toast.text}
          </div>
        ))}
      </div>
    </>
  );
}
