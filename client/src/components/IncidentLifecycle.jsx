// // Incident lifecycle strip + timeline, drawn only from the persisted incident.
// import { clockTime, formatMs, statusTone } from "../lib/api";

// const STAGES = ["detected", "diagnosing", "recovering", "verifying"];
// const OUTCOMES = ["recovered", "degraded", "failed"];

// function firstAt(timeline, status) {
//   return timeline.find((entry) => entry.status === status)?.at || null;
// }

// export function LifecycleStrip({ incident }) {
//   const timeline = incident.timeline || [];
//   const start = new Date(incident.detectedAt).getTime();
//   const offset = (at) => (at ? `+${((new Date(at).getTime() - start) / 1000).toFixed(1)}s` : "");
//   const reachedIndex = STAGES.indexOf(incident.status);
//   const outcome = OUTCOMES.includes(incident.status) ? incident.status : null;

//   return (
//     <ol className="hl-lifecycle" aria-label="Incident lifecycle">
//       {STAGES.map((stage, index) => {
//         const at = firstAt(timeline, stage);
//         const isCurrent = !outcome && incident.status === stage;
//         const isDone = !isCurrent && (Boolean(at) || outcome || index < reachedIndex);
//         return (
//           <li key={stage} className={`hl-stage ${isCurrent ? "is-current" : isDone ? "is-done" : ""}`}>
//             {stage}
//             <small>{at ? offset(at) : isCurrent ? "now" : "—"}</small>
//           </li>
//         );
//       })}
//       <li className={`hl-stage ${outcome === "recovered" ? "is-done" : outcome === "failed" ? "is-bad" : outcome === "degraded" ? "is-warn" : ""}`}>
//         {outcome || "outcome"}
//         <small>{outcome ? offset(incident.recoveredAt || timeline[timeline.length - 1]?.at) : "pending"}</small>
//       </li>
//     </ol>
//   );
// }

// export function IncidentDetail({ incident }) {
//   if (!incident) return null;
//   const timeline = incident.timeline || [];
//   const legacy = timeline.length === 0;

//   return (
//     <div className="hl-result">
//       <div className="hl-result__head">
//         <div>
//           <p className="hl-eyebrow">Incident</p>
//           <p className="hl-mono">{incident._id}</p>
//           <p className="hl-small">
//             {incident.service} · {incident.incidentType?.replaceAll("_", " ")} · {incident.severity} severity · source {incident.source}
//             {incident.runId ? ` · run ${incident.runId}` : ""}
//           </p>
//         </div>
//         <span className={`cs-pill cs-pill--${statusTone(incident.status)}`}>
//           <span className="dot" />
//           {String(incident.status).toUpperCase()}
//         </span>
//       </div>

//       {legacy ? (
//         <p className="hl-callout">
//           Legacy record created before lifecycle tracking was added. It has no timeline or verification evidence.
//         </p>
//       ) : (
//         <LifecycleStrip incident={incident} />
//       )}

//       <dl className="hl-kv">
//         <div><dt>Detected</dt><dd>{clockTime(incident.detectedAt)}</dd></div>
//         <div><dt>Time to detect</dt><dd>{formatMs(incident.detectionTimeMs)}</dd></div>
//         <div><dt>Time to recover</dt><dd>{incident.status === "recovered" ? formatMs(incident.recoveryTimeMs) : "not recovered"}</dd></div>
//         <div><dt>Retries</dt><dd>{incident.retryCount ?? 0}</dd></div>
//       </dl>

//       <div>
//         <p className="hl-eyebrow">Root-cause hypothesis</p>
//         <p className="hl-muted">{incident.rootCause || incident.diagnosis || "Diagnosis pending"}</p>
//       </div>

//       <div>
//         <p className="hl-eyebrow">Verification</p>
//         {incident.verification?.passed === true ? (
//           <p className="hl-callout hl-callout--ok">Passed — {incident.verification.detail}</p>
//         ) : incident.verification?.passed === false ? (
//           <p className="hl-callout hl-callout--bad">Not passed — {incident.verification.detail}</p>
//         ) : (
//           <p className="hl-muted">No verification recorded yet.</p>
//         )}
//       </div>

//       {incident.actions?.length > 0 && (
//         <div>
//           <p className="hl-eyebrow">Recovery actions</p>
//           <ol className="hl-steps">
//             {incident.actions.map((action, index) => (
//               <li key={`${action.at}-${index}`}>
//                 <time>{clockTime(action.at)}</time>
//                 <span>
//                   <strong>{action.name}</strong> {action.ok === true ? "✓" : action.ok === false ? "✗" : "…"} {action.detail}
//                 </span>
//               </li>
//             ))}
//           </ol>
//         </div>
//       )}

//       {!legacy && (
//         <div>
//           <p className="hl-eyebrow">Timeline</p>
//           <ol className="hl-timeline">
//             {timeline.map((entry, index) => (
//               <li key={`${entry.at}-${index}`}>
//                 <time>{clockTime(entry.at)}</time>
//                 <span className={`cs-pill cs-pill--sm cs-pill--${statusTone(entry.status)}`}>{entry.status}</span>
//                 <span className="hl-muted">{entry.note}</span>
//               </li>
//             ))}
//           </ol>
//         </div>
//       )}

//       {incident.evidence && Object.keys(incident.evidence).length > 0 && (
//         <details>
//           <summary className="hl-eyebrow">Evidence (raw)</summary>
//           <pre className="hl-pre">{JSON.stringify(incident.evidence, null, 2)}</pre>
//         </details>
//       )}
//     </div>
//   );
// }

import { useState } from "react";
import { clockTime, formatMs, statusTone, request } from "../lib/api";

const STAGES = ["detected", "diagnosing", "recovering", "verifying"];
const OUTCOMES = ["recovered", "degraded", "failed"];
const RECOVERABLE = ["detected", "degraded", "failed"];

function firstAt(timeline, status) {
  return timeline.find((entry) => entry.status === status)?.at || null;
}

function readable(value = "") {
  return String(value).replaceAll("_", " ");
}

function offset(at, start) {
  if (!at || !start) return "—";
  const seconds = (new Date(at).getTime() - new Date(start).getTime()) / 1000;
  return `${seconds >= 0 ? "+" : ""}${seconds.toFixed(1)}s`;
}

function Icon({ name }) {
  const props = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (name === "check") {
    return <svg {...props}><path d="m5 12 4 4L19 6" /></svg>;
  }

  if (name === "alert") {
    return <svg {...props}><path d="M12 9v4m0 4h.01" /><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" /></svg>;
  }

  return <svg {...props}><path d="M20 7v5h-5" /><path d="M4.9 9A7.5 7.5 0 0 1 17.6 6L20 12" /><path d="M4 17v-5h5" /><path d="M19.1 15A7.5 7.5 0 0 1 6.4 18L4 12" /></svg>;
}

/* Manual recovery control for rider-tracking incidents */
function RecoveryControl({ incident }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  const isTrackingIncident =
    incident.incidentType === "rider_tracking_stale";

  const inProgress = [
    "diagnosing",
    "recovering",
    "verifying",
  ].includes(incident.status);

  const canRecover =
    isTrackingIncident &&
    RECOVERABLE.includes(incident.status);

  if (!isTrackingIncident) return null;

  // async function handleRecover() {
  //   setBusy(true);
  //   setMessage("");

  //   try {
  //     const result = await request(
  //       `/api/reliability/incidents/${incident._id}/recover`,
  //       { method: "POST" }
  //     );

  //     setMessage(
  //       result?.message ||
  //       "Recovery request completed. Refresh the incident to confirm its status."
  //     );
  //     setMessageType("success");
  //   } catch (error) {
  //     setMessage(error?.message || "Recovery failed. Check the backend logs.");
  //     setMessageType("error");
  //   } finally {
  //     setBusy(false);
  //   }
  // }
    async function handleRecover() {
    setBusy(true);
    setMessage("");
    setMessageType("info");

    try {
      const response = await request(
        `/api/reliability/incidents/${incident._id}/recover`,
        { method: "POST" }
      );

      // A successful HTTP response alone does not prove recovery.
      const latest = await request(
        `/api/reliability/incidents/${incident._id}`
      );

      const currentIncident = latest?.incident;
      const verified =
        currentIncident?.status === "recovered" &&
        currentIncident?.verification?.passed === true;

      if (verified) {
        setMessage(
          currentIncident.verification.detail ||
            "Recovery completed and verified by the backend."
        );
        setMessageType("success");
      } else {
        setMessage(
          currentIncident?.verification?.detail ||
            response?.message ||
            `Recovery is not yet verified. Current status: ${
              currentIncident?.status || "unknown"
            }. Check the incident timeline before retrying.`
        );
        setMessageType("info");
      }
    } catch (error) {
      setMessage(
        error?.message ||
          "Recovery failed. Check the incident details and backend logs."
      );
      setMessageType("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="hl-recovery">
      <div className="hl-recovery__description">
        <span className="hl-recovery__icon">
          <Icon name="refresh" />
        </span>

        <div>
          <p className="hl-eyebrow">Operator action</p>
          <h3>Tracking recovery</h3>
          <p>
            Restart the rider worker and verify that fresh, valid location
            data is written before recovery is accepted.
          </p>
        </div>
      </div>

      <button
        type="button"
        className="hl-recovery__button"
        onClick={handleRecover}
        disabled={!canRecover || busy || inProgress}
      >
        {busy ? (
          <span className="hl-spinner" />
        ) : (
          <Icon name="refresh" />
        )}

        {busy
          ? "Recovering..."
          : inProgress
          ? "Recovery in progress"
          : incident.status === "recovered"
          ? "Recovered"
          : "Recover tracking"}
      </button>

      {message && (
        <div
          className={`hl-recovery__message is-${messageType}`}
          role="status"
          aria-live="polite"
        >
          <Icon name={messageType === "success" ? "check" : "alert"} />
          <span>{message}</span>
        </div>
      )}

      {incident.status === "recovered" &&
        incident.verification?.passed === true && (
          <div className="hl-recovery__message is-success">
            <Icon name="check" />
            <span>
              Recovery verified by the backend.
              Fresh tracking data was confirmed.
            </span>
          </div>
        )}

      <style>{`
        .hl-recovery {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 16px;
          align-items: center;
          padding: 18px;
          border: 1px solid #cfe0ff;
          border-radius: 16px;
          background: linear-gradient(120deg, #f2f7ff, #ffffff);
          color: #183153;
        }

        .hl-recovery__description {
          display: flex;
          gap: 13px;
          align-items: flex-start;
        }

        .hl-recovery__icon {
          display: grid;
          place-items: center;
          width: 42px;
          height: 42px;
          flex-shrink: 0;
          border-radius: 12px;
          background: #dbeafe;
          color: #1d4ed8;
        }

        .hl-recovery h3 {
          margin: 0 0 6px;
          font-size: 15px;
          font-weight: 750;
        }

        .hl-recovery__description p:last-child {
          margin: 0;
          color: #64748b;
          font-size: 12px;
          line-height: 1.65;
        }

        .hl-recovery .hl-eyebrow {
          margin: 0 0 5px;
          color: #2563eb;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .hl-recovery__button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          min-height: 43px;
          padding: 0 17px;
          border: 0;
          border-radius: 10px;
          background: #2563eb;
          color: white;
          font: inherit;
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
          white-space: nowrap;
          box-shadow: 0 5px 14px #2563eb25;
          transition: background .2s, transform .2s;
        }

        .hl-recovery__button:hover:not(:disabled) {
          background: #1d4ed8;
          transform: translateY(-1px);
        }

        .hl-recovery__button:focus-visible {
          outline: 3px solid #93c5fd;
          outline-offset: 3px;
        }

        .hl-recovery__button:disabled {
          cursor: not-allowed;
          opacity: .58;
          box-shadow: none;
        }

        .hl-spinner {
          width: 15px;
          height: 15px;
          border: 2px solid #ffffff77;
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: hl-spin .7s linear infinite;
        }

        @keyframes hl-spin {
          to { transform: rotate(360deg); }
        }

        .hl-recovery__message {
          grid-column: 1 / -1;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 11px 12px;
          border-radius: 10px;
          font-size: 12px;
          line-height: 1.55;
        }

        .hl-recovery__message svg {
          flex-shrink: 0;
          width: 16px;
          height: 16px;
        }

        .hl-recovery__message.is-success {
          background: #ecfdf3;
          color: #067647;
        }

        .hl-recovery__message.is-error {
          background: #fff1f2;
          color: #be123c;
        }

        .hl-recovery__message.is-info {
          background: #eff6ff;
          color: #1d4ed8;
        }

        @media (max-width: 650px) {
          .hl-recovery {
            grid-template-columns: 1fr;
          }

          .hl-recovery__button {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}

export function LifecycleStrip({ incident }) {
  const timeline = incident.timeline || [];
  const outcome = OUTCOMES.includes(incident.status)
    ? incident.status
    : null;

  const reachedIndex = STAGES.indexOf(incident.status);

  return (
    <ol className="hl-lifecycle" aria-label="Incident lifecycle">
      {STAGES.map((stage, index) => {
        const at = firstAt(timeline, stage);
        const current = !outcome && incident.status === stage;

        const done =
          !current &&
          (Boolean(at) || Boolean(outcome) || index < reachedIndex);

        return (
          <li
            key={stage}
            className={`hl-stage ${
              current ? "is-current" : done ? "is-done" : ""
            }`}
          >
            <span className="hl-stage__marker">
              {done ? <Icon name="check" /> : index + 1}
            </span>

            <span className="hl-stage__content">
              <strong>{readable(stage)}</strong>
              <small>
                {at
                  ? offset(at, incident.detectedAt)
                  : current
                  ? "In progress"
                  : "Waiting"}
              </small>
            </span>
          </li>
        );
      })}

      <li
        className={`hl-stage hl-stage--outcome ${
          outcome ? `is-${outcome}` : ""
        }`}
      >
        <span className="hl-stage__marker">
          {outcome === "recovered" ? (
            <Icon name="check" />
          ) : outcome === "failed" ? (
            <Icon name="alert" />
          ) : (
            "5"
          )}
        </span>

        <span className="hl-stage__content">
          <strong>{outcome || "Outcome"}</strong>
          <small>
            {outcome
              ? offset(
                  incident.recoveredAt ||
                    timeline[timeline.length - 1]?.at,
                  incident.detectedAt
                )
              : "Pending"}
          </small>
        </span>
      </li>
    </ol>
  );
}

export function IncidentDetail({ incident }) {
  if (!incident) return null;

  const timeline = incident.timeline || [];
  const legacy = timeline.length === 0;
  const verification = incident.verification;

  return (
    <article className="hl-result hl-incident-detail">
      <style>{`
        .hl-incident-detail {
          display: grid;
          gap: 22px;
          color: #183153;
        }

        .hl-incident-detail .hl-result__head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 16px;
          padding-bottom: 18px;
          border-bottom: 1px solid #e2eaf4;
        }

        .hl-incident-detail .hl-mono {
          overflow-wrap: anywhere;
          color: #526780;
          font-size: 12px;
        }

        .hl-incident-detail .hl-small {
          color: #64748b;
          font-size: 12px;
          line-height: 1.7;
        }

        .hl-incident-detail .hl-eyebrow {
          margin: 0 0 9px;
          color: #71839a;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .hl-incident-detail .hl-muted {
          margin: 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.7;
        }

        .hl-incident-detail .hl-callout {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 13px 15px;
          border: 1px solid #d9e7f8;
          border-radius: 12px;
          background: #f7faff;
          color: #48617d;
          font-size: 12px;
          line-height: 1.6;
        }

        .hl-incident-detail .hl-callout--ok {
          border-color: #b7ebd0;
          background: #effcf5;
          color: #167448;
        }

        .hl-incident-detail .hl-callout--bad {
          border-color: #fecaca;
          background: #fff5f5;
          color: #b42318;
        }

        .hl-incident-detail .hl-lifecycle {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 9px;
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .hl-incident-detail .hl-stage {
          display: flex;
          flex-direction: column;
          gap: 11px;
          min-width: 0;
          padding: 13px 11px;
          border: 1px solid #e2eaf4;
          border-radius: 13px;
          background: #fbfdff;
          color: #73839a;
        }

        .hl-incident-detail .hl-stage.is-current {
          border-color: #9fc2ff;
          background: #eff6ff;
          color: #1d4ed8;
        }

        .hl-incident-detail .hl-stage.is-done,
        .hl-incident-detail .hl-stage--outcome.is-recovered {
          border-color: #bcebd2;
          background: #f0fdf7;
          color: #13764a;
        }

        .hl-incident-detail .hl-stage--outcome.is-failed {
          border-color: #fecaca;
          background: #fff5f5;
          color: #b42318;
        }

        .hl-incident-detail .hl-stage--outcome.is-degraded {
          border-color: #fde68a;
          background: #fffbeb;
          color: #92400e;
        }

        .hl-incident-detail .hl-stage__marker {
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          border-radius: 9px;
          background: #edf2f8;
          color: inherit;
          font-size: 12px;
          font-weight: 800;
        }

        .hl-incident-detail .hl-stage__marker svg {
          width: 15px;
          height: 15px;
        }

        .hl-incident-detail .hl-stage__content {
          display: grid;
          gap: 5px;
        }

        .hl-incident-detail .hl-stage__content strong {
          overflow-wrap: anywhere;
          font-size: 11px;
          text-transform: capitalize;
        }

        .hl-incident-detail .hl-stage__content small {
          color: #64748b;
          font-size: 10px;
        }

        .hl-incident-detail .hl-kv {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin: 0;
        }

        .hl-incident-detail .hl-kv > div {
          min-width: 0;
          padding: 14px;
          border: 1px solid #e2eaf4;
          border-radius: 12px;
          background: #fff;
        }

        .hl-incident-detail .hl-kv dt {
          margin-bottom: 8px;
          color: #64748b;
          font-size: 11px;
        }

        .hl-incident-detail .hl-kv dd {
          margin: 0;
          overflow-wrap: anywhere;
          color: #183153;
          font-size: 14px;
          font-weight: 750;
        }

        .hl-incident-detail .hl-steps,
        .hl-incident-detail .hl-timeline {
          display: grid;
          gap: 9px;
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .hl-incident-detail .hl-steps li,
        .hl-incident-detail .hl-timeline li {
          display: flex;
          align-items: flex-start;
          gap: 11px;
          padding: 12px;
          border: 1px solid #e2eaf4;
          border-radius: 11px;
          font-size: 12px;
          line-height: 1.6;
        }

        .hl-incident-detail .hl-steps time,
        .hl-incident-detail .hl-timeline time {
          padding-top: 2px;
          color: #64748b;
          font-size: 11px;
          white-space: nowrap;
        }

        .hl-incident-detail .hl-steps strong {
          color: #253d5c;
        }

        .hl-incident-detail .hl-timeline .hl-muted {
          flex: 1;
        }

        .hl-incident-detail .hl-pre {
          overflow: auto;
          padding: 14px;
          border: 1px solid #e2eaf4;
          border-radius: 10px;
          background: #f8fafc;
          font-size: 11px;
        }

        .hl-incident-detail details summary {
          cursor: pointer;
        }

        @media (max-width: 760px) {
          .hl-incident-detail .hl-lifecycle {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .hl-incident-detail .hl-stage--outcome {
            grid-column: 1 / -1;
          }

          .hl-incident-detail .hl-kv {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 420px) {
          .hl-incident-detail .hl-timeline li {
            flex-wrap: wrap;
          }
        }
      `}</style>

      <header className="hl-result__head">
        <div>
          <p className="hl-eyebrow">Incident detail</p>
          <p className="hl-mono">{incident._id}</p>
          <p className="hl-small">
            {incident.service} · {readable(incident.incidentType)} ·{" "}
            {incident.severity} severity · source {incident.source}
            {incident.runId ? ` · run ${incident.runId}` : ""}
          </p>
        </div>

        <span className={`cs-pill cs-pill--${statusTone(incident.status)}`}>
          <span className="dot" />
          {String(incident.status).toUpperCase()}
        </span>
      </header>

      <RecoveryControl incident={incident} />

      {legacy ? (
        <p className="hl-callout">
          Legacy incident record. It has no persisted lifecycle timeline or
          verification evidence.
        </p>
      ) : (
        <section>
          <p className="hl-eyebrow">Recovery lifecycle</p>
          <LifecycleStrip incident={incident} />
        </section>
      )}

      <section>
        <p className="hl-eyebrow">Incident metrics</p>
        <dl className="hl-kv">
          <div>
            <dt>Detected at</dt>
            <dd>{clockTime(incident.detectedAt)}</dd>
          </div>
          <div>
            <dt>Time to detect</dt>
            <dd>{formatMs(incident.detectionTimeMs)}</dd>
          </div>
          <div>
            <dt>Time to recover</dt>
            <dd>
              {incident.status === "recovered"
                ? formatMs(incident.recoveryTimeMs)
                : "Pending"}
            </dd>
          </div>
          <div>
            <dt>Recovery retries</dt>
            <dd>{incident.retryCount ?? 0}</dd>
          </div>
        </dl>
      </section>

      <section>
        <p className="hl-eyebrow">Root-cause hypothesis</p>
        <p className="hl-muted">
          {incident.rootCause ||
            incident.diagnosis ||
            "Diagnosis pending"}
        </p>
      </section>

      <section>
        <p className="hl-eyebrow">Recovery verification</p>

        {verification?.passed === true ? (
          <p className="hl-callout hl-callout--ok">
            <Icon name="check" />
            Passed — {verification.detail || "Backend verification confirmed."}
          </p>
        ) : verification?.passed === false ? (
          <p className="hl-callout hl-callout--bad">
            <Icon name="alert" />
            Not passed — {verification.detail || "Verification failed."}
          </p>
        ) : (
          <p className="hl-callout">
            No verification recorded yet. The incident must not be considered
            recovered until backend verification passes.
          </p>
        )}
      </section>

      {incident.actions?.length > 0 && (
        <section>
          <p className="hl-eyebrow">Recovery actions</p>

          <ol className="hl-steps">
            {incident.actions.map((action, index) => (
              <li key={`${action.at}-${index}`}>
                <time>{clockTime(action.at)}</time>
                <span>
                  <strong>{action.name}</strong>{" "}
                  {action.ok === true ? "✓" : action.ok === false ? "✕" : "…"}{" "}
                  {action.detail}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {!legacy && (
        <section>
          <p className="hl-eyebrow">Persisted event timeline</p>

          <ol className="hl-timeline">
            {timeline.map((entry, index) => (
              <li key={`${entry.at}-${index}`}>
                <time>{clockTime(entry.at)}</time>
                <span
                  className={`cs-pill cs-pill--sm cs-pill--${statusTone(
                    entry.status
                  )}`}
                >
                  {entry.status}
                </span>
                <span className="hl-muted">{entry.note}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {incident.evidence &&
        Object.keys(incident.evidence).length > 0 && (
          <details>
            <summary className="hl-eyebrow">Evidence (raw)</summary>
            <pre className="hl-pre">
              {JSON.stringify(incident.evidence, null, 2)}
            </pre>
          </details>
        )}
    </article>
  );
}