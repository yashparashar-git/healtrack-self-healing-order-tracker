// IncidentCard: Detected -> Diagnosed -> Action taken -> Recovered (sample data)
// File location: src/components/IncidentCard.jsx
const INCIDENT = [
  ["bad", "Detected", "[00:00.0]"],
  ["warn", "Diagnosed", "[00:01.2]"],
  ["warn", "Action taken", "[00:01.4]"],
  ["ok", "Recovered, verified", "[00:08.4]"],
];

export default function IncidentCard() {
  return (
    <div className="inc">
      <div className="inc__head">
        <strong>Incident timeline</strong>
        <span className="pill">Recovered</span>
      </div>
      <ul className="inc__list">
        {INCIDENT.map(([tone, label, time]) => (
          <li className="inc__row" key={label}>
            <span className={`dot dot--${tone}`} />
            {label}
            <span className="mono">{time}</span>
          </li>
        ))}
      </ul>
      <p className="inc__hint">Sample data. Real runs show measured timings.</p>
    </div>
  );
}
