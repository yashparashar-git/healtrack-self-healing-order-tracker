// Incident lifecycle strip + timeline, drawn only from the persisted incident.
import { clockTime, formatMs, statusTone } from "../lib/api";

const STAGES = ["detected", "diagnosing", "recovering", "verifying"];
const OUTCOMES = ["recovered", "degraded", "failed"];

function firstAt(timeline, status) {
  return timeline.find((entry) => entry.status === status)?.at || null;
}

export function LifecycleStrip({ incident }) {
  const timeline = incident.timeline || [];
  const start = new Date(incident.detectedAt).getTime();
  const offset = (at) => (at ? `+${((new Date(at).getTime() - start) / 1000).toFixed(1)}s` : "");
  const reachedIndex = STAGES.indexOf(incident.status);
  const outcome = OUTCOMES.includes(incident.status) ? incident.status : null;

  return (
    <ol className="hl-lifecycle" aria-label="Incident lifecycle">
      {STAGES.map((stage, index) => {
        const at = firstAt(timeline, stage);
        const isCurrent = !outcome && incident.status === stage;
        const isDone = !isCurrent && (Boolean(at) || outcome || index < reachedIndex);
        return (
          <li key={stage} className={`hl-stage ${isCurrent ? "is-current" : isDone ? "is-done" : ""}`}>
            {stage}
            <small>{at ? offset(at) : isCurrent ? "now" : "—"}</small>
          </li>
        );
      })}
      <li className={`hl-stage ${outcome === "recovered" ? "is-done" : outcome === "failed" ? "is-bad" : outcome === "degraded" ? "is-warn" : ""}`}>
        {outcome || "outcome"}
        <small>{outcome ? offset(incident.recoveredAt || timeline[timeline.length - 1]?.at) : "pending"}</small>
      </li>
    </ol>
  );
}

export function IncidentDetail({ incident }) {
  if (!incident) return null;
  const timeline = incident.timeline || [];
  const legacy = timeline.length === 0;

  return (
    <div className="hl-result">
      <div className="hl-result__head">
        <div>
          <p className="hl-eyebrow">Incident</p>
          <p className="hl-mono">{incident._id}</p>
          <p className="hl-small">
            {incident.service} · {incident.incidentType?.replaceAll("_", " ")} · {incident.severity} severity · source {incident.source}
            {incident.runId ? ` · run ${incident.runId}` : ""}
          </p>
        </div>
        <span className={`cs-pill cs-pill--${statusTone(incident.status)}`}>
          <span className="dot" />
          {String(incident.status).toUpperCase()}
        </span>
      </div>

      {legacy ? (
        <p className="hl-callout">
          Legacy record created before lifecycle tracking was added. It has no timeline or verification evidence.
        </p>
      ) : (
        <LifecycleStrip incident={incident} />
      )}

      <dl className="hl-kv">
        <div><dt>Detected</dt><dd>{clockTime(incident.detectedAt)}</dd></div>
        <div><dt>Time to detect</dt><dd>{formatMs(incident.detectionTimeMs)}</dd></div>
        <div><dt>Time to recover</dt><dd>{incident.status === "recovered" ? formatMs(incident.recoveryTimeMs) : "not recovered"}</dd></div>
        <div><dt>Retries</dt><dd>{incident.retryCount ?? 0}</dd></div>
      </dl>

      <div>
        <p className="hl-eyebrow">Root-cause hypothesis</p>
        <p className="hl-muted">{incident.rootCause || incident.diagnosis || "Diagnosis pending"}</p>
      </div>

      <div>
        <p className="hl-eyebrow">Verification</p>
        {incident.verification?.passed === true ? (
          <p className="hl-callout hl-callout--ok">Passed — {incident.verification.detail}</p>
        ) : incident.verification?.passed === false ? (
          <p className="hl-callout hl-callout--bad">Not passed — {incident.verification.detail}</p>
        ) : (
          <p className="hl-muted">No verification recorded yet.</p>
        )}
      </div>

      {incident.actions?.length > 0 && (
        <div>
          <p className="hl-eyebrow">Recovery actions</p>
          <ol className="hl-steps">
            {incident.actions.map((action, index) => (
              <li key={`${action.at}-${index}`}>
                <time>{clockTime(action.at)}</time>
                <span>
                  <strong>{action.name}</strong> {action.ok === true ? "✓" : action.ok === false ? "✗" : "…"} {action.detail}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {!legacy && (
        <div>
          <p className="hl-eyebrow">Timeline</p>
          <ol className="hl-timeline">
            {timeline.map((entry, index) => (
              <li key={`${entry.at}-${index}`}>
                <time>{clockTime(entry.at)}</time>
                <span className={`cs-pill cs-pill--sm cs-pill--${statusTone(entry.status)}`}>{entry.status}</span>
                <span className="hl-muted">{entry.note}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {incident.evidence && Object.keys(incident.evidence).length > 0 && (
        <details>
          <summary className="hl-eyebrow">Evidence (raw)</summary>
          <pre className="hl-pre">{JSON.stringify(incident.evidence, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
