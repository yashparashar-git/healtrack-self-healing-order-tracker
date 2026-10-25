// Shared top bar for the console pages: Delivery console, Chaos Lab, Self-Healing Portal.
import { Link, NavLink } from "react-router-dom";

const linkClass = ({ isActive }) => `nav__link${isActive ? " nav__link--active" : ""}`;

export default function ConsoleNav({ apiState = "checking", apiLabel = "Checking API" }) {
  return (
    <header className="nav">
      <div className="container nav__inner">
        <Link className="nav__brand" to="/" aria-label="HealTrack AI home">
          <svg className="nav__icon" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12h4l2-6 4 12 2-6h6" />
          </svg>
          <span>HealTrack <span className="nav__ai">AI</span></span>
        </Link>

        <nav className="nav__links hl-navlinks" aria-label="Main">
          <NavLink className={linkClass} to="/console">Delivery console</NavLink>
          <NavLink className={linkClass} to="/chaos">Chaos Lab</NavLink>
          <NavLink className={linkClass} to="/healing">Self-Healing Portal</NavLink>
          <span className={`cs-api cs-api--${apiState}`}>
            <span className="dot" />
            {apiLabel}
          </span>
        </nav>
      </div>
    </header>
  );
}
