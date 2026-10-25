import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ConsoleNav from "../components/ConsoleNav";
import { LifecycleStrip } from "../components/IncidentLifecycle";
import { clockTime, formatMs, request, statusTone, timeAgo } from "../lib/api";
import "./healing.css";

const RUN_TONE = { RUNNING: "warn", PASSED: "ok", DEGRADED: "warn", FAILED: "bad", BLOCKED: "bad" };

function useChaosLab() {
  const [status, setStatus] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [targets, setTargets] = useState([]);
  const [runs, setRuns] = useState([]);
  const [apiState, setApiState] = useState("checking");
  const [error, setError] = useState("");

  const [selectedId, setSelectedId] = useState("rider_tracking");
  const [orderId, setOrderId] = useState("");
  const [params, setParams] = useState({});
  const [currentRunId, setCurrentRunId] = useState("");
  const [currentRun, setCurrentRun] = useState(null);
  const [currentIncident, setCurrentIncident] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [statusData, scenarioData, targetData, runData] = await Promise.all([
        request("/api/chaos/status"),
        request("/api/chaos/scenarios"),
        request("/api/chaos/targets"),
        request("/api/chaos/runs?limit=15"),
      ]);
      setStatus(statusData);
      setScenarios(scenarioData.scenarios || []);
      setTargets(targetData.targets || []);
      setRuns(runData.runs || []);
      setApiState("online");
      setError("");
    } catch (err) {
      setApiState(err.offline ? "offline" : "online");
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  // Follow the selected run and its linked incident while it is shown.
  useEffect(() => {
    if (!currentRunId) return undefined;
    let active = true;

    const poll = async () => {
      try {
        const { run } = await request(`/api/chaos/runs/${currentRunId}`);
        if (!active) return;
        setCurrentRun(run);
        if (run.incidentId) {
          const { incident } = await request(`/api/reliability/incidents/${run.incidentId}`);
          if (active) setCurrentIncident(incident);
        } else {
          setCurrentIncident(null);
        }
      } catch (err) {
        // During the crash scenario the API is briefly down; keep polling.
        if (active && !err.offline) setError(err.message);
      }
    };

    poll();
    const timer = setInterval(poll, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [currentRunId]);

  const scenario = scenarios.find((item) => item.id === selectedId) || null;
  const labBusy = Boolean(status?.activeRun) || currentRun?.status === "RUNNING" || submitting;

  // Until the operator picks one, target the newest order whose rider is moving.
  const defaultTarget = targets.find((target) => target.simulationRunning) || targets[0];
  const targetId = orderId || (scenario?.requiresOrder === "optional" ? "" : String(defaultTarget?.id || ""));

  function selectScenario(id) {
    setSelectedId(id);
    setParams({});
  }

  async function startRun() {
    if (!scenario) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const body = { scenario: scenario.id, params: {} };
      Object.entries(scenario.params || {}).forEach(([key, spec]) => {
        body.params[key] = params[key] ?? spec.default;
      });
      if (scenario.requiresOrder !== "none" && targetId) body.orderId = targetId;

      const data = await request("/api/chaos/runs", { method: "POST", body: JSON.stringify(body) });
      setCurrentIncident(null);
      setCurrentRun(data.run);
      setCurrentRunId(data.run.runId);
      setNotice(`Run ${data.run.runId} started. Fault injection is in progress on the backend.`);
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function resetFaults() {
    setError("");
    try {
      await request("/api/chaos/reset", { method: "POST" });
      setNotice("All injected faults cleared. Incidents and run history are kept.");
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  function viewRun(run) {
    setCurrentIncident(null);
    setCurrentRun(run);
    setCurrentRunId(run.runId);
    setSelectedId(run.scenario);
    setParams(run.params || {});
    if (run.orderId) setOrderId(String(run.orderId));
  }

  return {
    status, scenarios, targets, runs, apiState, error, notice, setNotice,
    selectedId, selectScenario, scenario, orderId: targetId, setOrderId, params, setParams,
    currentRun, currentIncident, labBusy, startRun, resetFaults, viewRun,
  };
}

function ScenarioPicker({ scenarios, selectedId, selectScenario, labBusy }) {
  return (
    <section className="cs-card">
      <p className="hl-eyebrow">Step 1</p>
      <h2 className="cs-card__title">Choose a controlled failure</h2>
      <div className="hl-scenarios" role="radiogroup" aria-label="Scenario">
        {scenarios.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={selectedId === item.id}
            className={`hl-scenario ${selectedId === item.id ? "is-selected" : ""}`}
            onClick={() => selectScenario(item.id)}
            disabled={labBusy}
          >
            <span className="hl-scenario__name">
              {item.name}
              {!item.available && <span className="cs-pill cs-pill--sm cs-pill--bad">Blocked</span>}
            </span>
            <span className="hl-scenario__desc">{item.description}</span>
          </button>
        ))}
        {scenarios.length === 0 && <p className="hl-empty">Loading scenarios…</p>}
      </div>
    </section>
  );
}

function RunConfig({ scenario, targets, orderId, setOrderId, params, setParams, labBusy, startRun, resetFaults, enabled, currentRun }) {
  if (!scenario) return null;
  const needsOrder = scenario.requiresOrder !== "none";
  const target = targets.find((item) => String(item.id) === orderId);
  const needsRunning = scenario.requiresOrder === "running";
  const missingTarget = (scenario.requiresOrder === "running" || scenario.requiresOrder === "any") && !orderId;
  const finished = currentRun && currentRun.status !== "RUNNING" && currentRun.scenario === scenario.id;

  return (
    <section className="cs-card">
      <p className="hl-eyebrow">Step 2</p>
      <h2 className="cs-card__title">{scenario.name}</h2>
      <div className="hl-config">
        <dl>
          <dt>Risk / scope</dt><dd>{scenario.risk}</dd>
          <dt>Expected</dt><dd>{scenario.expected}</dd>
        </dl>

        {needsOrder && (
          <div className="field">
            <label className="field__label" htmlFor="chaosTarget">
              Target order {scenario.requiresOrder === "optional" ? "(optional — uses its route)" : ""}
            </label>
            <select id="chaosTarget" className="hl-select" value={orderId} onChange={(event) => setOrderId(event.target.value)} disabled={labBusy}>
              {scenario.requiresOrder === "optional" && <option value="">Default test route (hub → Ajmer Junction)</option>}
              {targets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.orderNumber.slice(-8)} · {item.customerName} · {item.status} · {item.simulationRunning ? "rider moving" : "rider stopped"}
                </option>
              ))}
            </select>
            {targets.length === 0 && <p className="hl-small">No undelivered orders. Create one in the Delivery console.</p>}
          </div>
        )}

        {needsRunning && target && !target.simulationRunning && (
          <p className="hl-callout">
            This order's rider is not moving, so the run will be reported as BLOCKED. Start the rider in the{" "}
            <Link className="cs-link" to="/console">Delivery console</Link> first.
          </p>
        )}

        {Object.entries(scenario.params || {}).map(([key, spec]) => {
          if (spec.appliesTo && params.mode !== spec.appliesTo && (params.mode || scenario.params.mode?.default) !== spec.appliesTo) {
            return null;
          }
          return (
            <div className="field" key={key}>
              <label className="field__label" htmlFor={`param-${key}`}>
                {key === "durationMs" ? "Fault duration (ms)" : key === "failCount" ? "Simulated failures" : "Mode"}
                {spec.type === "number" && ` — ${spec.min}–${spec.max}`}
              </label>
              {spec.type === "enum" ? (
                <select id={`param-${key}`} className="hl-select" value={params[key] ?? spec.default} disabled={labBusy}
                  onChange={(event) => setParams({ ...params, [key]: event.target.value })}>
                  {spec.values.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              ) : (
                <input id={`param-${key}`} className="hl-number" type="number" min={spec.min} max={spec.max} step={key === "failCount" ? 1 : 1000}
                  value={params[key] ?? spec.default} disabled={labBusy}
                  onChange={(event) => setParams({ ...params, [key]: Number(event.target.value) })} />
              )}
            </div>
          );
        })}

        {!scenario.available && <p className="hl-callout hl-callout--bad">{scenario.unavailableReason}</p>}

        <div className="hl-actions">
          <button className="btn btn--primary" onClick={startRun} disabled={!enabled || labBusy || missingTarget}>
            {labBusy ? "Run in progress…" : finished ? "Run again" : "Inject fault & run"}
          </button>
          <button className="btn btn--ghost" onClick={resetFaults} disabled={!enabled}>
            Clear all faults
          </button>
        </div>
        <p className="hl-small">
          Faults are bounded and auto-expire. "Clear all faults" stops any armed fault; it does not delete incidents.
        </p>
      </div>
    </section>
  );
}

function LiveRun({ run, incident }) {
  if (!run) {
    return (
      <section className="cs-card">
        <p className="hl-eyebrow">Step 3</p>
        <h2 className="cs-card__title">Live result</h2>
        <p className="hl-empty">No run selected. Inject a fault, or pick a run from the history below.</p>
      </section>
    );
  }

  return (
    <section className="cs-card" aria-live="polite">
      <div className="hl-result">
        <div className="hl-result__head">
          <div>
            <p className="hl-eyebrow">Step 3 · Live result</p>
            <h2 className="cs-card__title hl-mono">{run.runId}</h2>
            <p className="hl-small">{run.scenario} · started {clockTime(run.startedAt)} · {run.triggeredBy}</p>
          </div>
          <span className={`cs-pill cs-pill--${RUN_TONE[run.status] || "info"}`}>
            <span className="dot" />
            {run.status}
          </span>
        </div>

        <dl className="hl-kv">
          <div><dt>Injected fault</dt><dd>{run.injectedFault}</dd></div>
          <div><dt>Duration</dt><dd>{run.durationMs != null ? formatMs(run.durationMs) : "running…"}</dd></div>
          <div><dt>Incident</dt><dd className="hl-mono">{run.incidentId || "not yet detected"}</dd></div>
        </dl>

        {run.observed && (
          <p className={`hl-callout ${run.status === "PASSED" ? "hl-callout--ok" : run.status === "FAILED" || run.status === "BLOCKED" ? "hl-callout--bad" : ""}`}>
            <strong>Observed:</strong> {run.observed}
          </p>
        )}

        {incident && (
          <div>
            <p className="hl-eyebrow">Incident lifecycle (from the database)</p>
            <LifecycleStrip incident={incident} />
            <p className="hl-small">
              TTD {formatMs(incident.detectionTimeMs)} · TTR {incident.status === "recovered" ? formatMs(incident.recoveryTimeMs) : "—"} · retries {incident.retryCount ?? 0} ·{" "}
              <Link className="cs-link" to={`/healing?incident=${incident._id}`}>Open in Self-Healing Portal →</Link>
            </p>
          </div>
        )}

        <div>
          <p className="hl-eyebrow">Run steps</p>
          <ol className="hl-steps">
            {(run.steps || []).map((item, index) => (
              <li key={`${item.at}-${index}`}><time>{clockTime(item.at)}</time><span>{item.message}</span></li>
            ))}
          </ol>
        </div>

        {run.scenario === "process_crash" && run.status === "RUNNING" && (
          <p className="hl-callout">The API process is restarting under PM2. This page keeps polling and updates when the API is back.</p>
        )}
      </div>
    </section>
  );
}

function LabStatus({ status }) {
  const routing = status?.routing;
  const faults = status?.faults;
  return (
    <section className="cs-card">
      <h2 className="cs-card__title">Armed faults</h2>
      <ul className="hl-health">
        <li>
          <span>Routing wrapper<small>{routing?.chaosExpiresInMs ? `auto-off in ${formatMs(routing.chaosExpiresInMs)}` : "OSRM requests pass through"}</small></span>
          <span className={`cs-pill cs-pill--sm cs-pill--${routing?.failureMode === "off" ? "ok" : "warn"}`}>{routing?.failureMode || "—"}</span>
        </li>
        <li>
          <span>Routing circuit<small>{routing ? `${routing.consecutiveFailures} consecutive failures · cooldown ${formatMs(routing.cooldownRemainingMs)}` : ""}</small></span>
          <span className={`cs-pill cs-pill--sm cs-pill--${statusTone(routing?.circuitState)}`}>{routing?.circuitState || "—"}</span>
        </li>
        <li>
          <span>Tracking faults<small>{faults?.tracking?.length ? faults.tracking.map((f) => `${f.mode} on …${f.orderId.slice(-6)} (${formatMs(f.expiresInMs)} left)`).join(", ") : "none"}</small></span>
          <span className={`cs-pill cs-pill--sm cs-pill--${faults?.tracking?.length ? "warn" : "ok"}`}>{faults?.tracking?.length || 0}</span>
        </li>
        <li>
          <span>Database faults<small>{faults?.db ? `${faults.db.remaining} left on ${faults.db.op}` : "none"}</small></span>
          <span className={`cs-pill cs-pill--sm cs-pill--${faults?.db ? "warn" : "ok"}`}>{faults?.db ? faults.db.remaining : 0}</span>
        </li>
        <li>
          <span>Process supervisor<small>{status?.crashDemo?.reason || "Crash demo available"}</small></span>
          <span className={`cs-pill cs-pill--sm cs-pill--${status?.supervised ? "ok" : "warn"}`}>{status?.supervised ? "PM2" : "none"}</span>
        </li>
      </ul>
    </section>
  );
}

function RunHistory({ runs, viewRun, currentRunId }) {
  return (
    <section className="cs-card">
      <h2 className="cs-card__title">Run history</h2>
      {runs.length === 0 ? (
        <p className="hl-empty">No Chaos Lab runs yet.</p>
      ) : (
        <div className="hl-table-wrap">
          <table className="hl-table">
            <thead>
              <tr><th>Run</th><th>Scenario</th><th>Result</th><th>Started</th><th>Duration</th><th>Observed</th></tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.runId} className={`is-clickable ${currentRunId === run.runId ? "is-selected" : ""}`} onClick={() => viewRun(run)}>
                  <td className="hl-mono">{run.runId}</td>
                  <td>{run.scenario}</td>
                  <td><span className={`cs-pill cs-pill--sm cs-pill--${RUN_TONE[run.status] || "info"}`}>{run.status}</span></td>
                  <td className="num">{timeAgo(run.startedAt)}</td>
                  <td className="num">{run.durationMs != null ? formatMs(run.durationMs) : "—"}</td>
                  <td className="hl-muted">{run.observed || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function ChaosLab() {
  const c = useChaosLab();
  const enabled = Boolean(c.status?.enabled);
  const apiLabel = { online: "API connected", offline: "API offline", checking: "Checking API" }[c.apiState];

  const statusPill = useMemo(() => {
    if (!c.status) return ["info", "Loading"];
    return enabled ? ["ok", "Chaos Lab enabled · localhost only"] : ["bad", "Chaos Lab disabled"];
  }, [c.status, enabled]);

  return (
    <>
      <ConsoleNav apiState={c.apiState} apiLabel={apiLabel} />
      <main className="container cs-page">
        <div className="cs-head hl-head">
          <div>
            <h1>Chaos Lab</h1>
            <p>Inject a bounded, test-only failure on the backend and watch HealTrack detect, recover and verify it.</p>
          </div>
          <div className="hl-head__meta">
            <span className={`cs-pill cs-pill--${statusPill[0]}`}><span className="dot" />{statusPill[1]}</span>
            <Link className="btn btn--ghost btn--sm" to="/healing">Self-Healing Portal →</Link>
          </div>
        </div>

        {c.status && !enabled && <div className="cs-notice cs-notice--bad" role="alert">{c.status.reason}</div>}
        {c.error && <div className="cs-notice cs-notice--bad" role="alert">{c.error}</div>}
        {c.notice && <div className="cs-notice cs-notice--ok" role="status">{c.notice}</div>}

        <div className="hl-grid">
          <div className="hl-stack">
            <div className="hl-two">
              <ScenarioPicker {...c} />
              <RunConfig {...c} enabled={enabled} />
            </div>
            <LiveRun run={c.currentRun} incident={c.currentIncident} />
          </div>
          <div className="hl-stack">
            <LabStatus status={c.status} />
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          <RunHistory runs={c.runs} viewRun={c.viewRun} currentRunId={c.currentRun?.runId} />
        </div>
      </main>
    </>
  );
}
