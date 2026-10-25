// Footer: software-style footer (brand, product links, platform, contact, status bar)
// File location: src/components/Footer.jsx
const PLATFORM = ["Health checks", "Incident log", "Chaos testing", "AI diagnosis"];

export default function Footer({ onOpenConsole }) {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div>
            <div className="footer__brand">
              <svg className="nav__icon" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12h4l2-6 4 12 2-6h6" />
              </svg>
              <span>HealTrack <span className="nav__ai">AI</span></span>
            </div>
            <p className="footer__about">
              Self-healing delivery tracking. Detects failures, recovers automatically
              and shows the measured result.
            </p>
          </div>

          <nav aria-label="Product">
            <h4 className="footer__title">Product</h4>
            <ul className="footer__list">
              <li><a className="footer__link" href="#how-it-works">How it works</a></li>
              <li><a className="footer__link" href="#mechanisms">Mechanisms</a></li>
              <li><button type="button" className="footer__link" onClick={onOpenConsole}>Delivery console</button></li>
            </ul>
          </nav>

          <div>
            <h4 className="footer__title">Platform</h4>
            <ul className="footer__list">
              {PLATFORM.map((name) => (
                <li className="footer__soon" key={name}>
                  {name}
                  <span className="footer__tag">Soon</span>
                </li>
              ))}
            </ul>
          </div>

          <nav aria-label="Support">
            <h4 className="footer__title">Support</h4>
            <ul className="footer__list">
              <li><a className="footer__link" href="#contact">Contact us</a></li>
              <li><a className="footer__link" href="#top">Back to top</a></li>
            </ul>
          </nav>
        </div>

        <div className="footer__bottom">
          <span>HealTrack AI © 2026</span>
          <div className="footer__meta">
            <span className="mono">v0.1 prototype</span>
            <span className="footer__env"><span className="dot dot--teal" />Demo environment</span>
            <span>Simulated rider, not real GPS</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
