// NetworkCard: "Delivery network" visual (hub, rider, destination)
// File location: src/components/NetworkCard.jsx
const LINES = [
  "M25 250 L100 200 L145 220 L205 125 L275 155 L330 70 L415 100",
  "M60 65 L145 105 L205 125 L230 245 L325 270 L415 215",
  "M100 200 L110 300 L230 245 L275 155 L370 180",
  "M145 105 L185 35 L330 70",
];
const NODES = [[100, 200, 5], [205, 125, 7], [330, 70, 6], [230, 245, 5], [325, 270, 5], [275, 155, 5]];

export default function NetworkCard() {
  return (
    <div className="net">
      <div className="net__top">
        <span className="net__label">Delivery network</span>
        <span className="net__live"><span className="dot dot--ok" />Demo environment</span>
      </div>

      <div className="net__map">
        <svg className="net__svg" viewBox="0 0 440 330" role="img" aria-label="Connected delivery network">
          <circle className="net__ring" cx="220" cy="165" r="55" />
          <circle className="net__ring" cx="220" cy="165" r="100" />
          <circle className="net__ring net__ring--dashed" cx="220" cy="165" r="150" />
          {LINES.map((d) => <path key={d} className="net__line" d={d} />)}
          {NODES.map(([x, y, r]) => <circle key={`${x}-${y}`} className="net__node" cx={x} cy={y} r={r} />)}
        </svg>

        <span className="net__chip net__chip--hub">Hub <span>01</span></span>
        <span className="net__chip net__chip--rider">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8-8-2z" /></svg>
          Rider active
        </span>
        <span className="net__chip net__chip--dest">Destination</span>
      </div>

      <div className="net__bottom">
        <div className="net__approach">
          <span className="net__label">System approach</span>
          <strong>Detect → Diagnose → Recover</strong>
        </div>
        <span className="net__status"><span className="dot dot--teal" />Monitoring ready</span>
      </div>
    </div>
  );
}
