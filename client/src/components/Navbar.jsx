// Navbar (software style): logo, menu, Delivery console, Dashboard, Sign in, Get started
// File location: src/components/Navbar.jsx
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";

const linkClass = ({ isActive }) => `nav__link${isActive ? " nav__link--active" : ""}`;

export default function Navbar() {
  const [open, setOpen] = useState(false); // phone par menu khulna/band hona
  const close = () => setOpen(false);

  return (
    <header className="nav">
      <div className="container nav__inner">
        <Link className="nav__brand" to="/" onClick={close} aria-label="HealTrack home">
          <span className="nav__mark">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12h4l2-6 4 12 2-6h6" />
            </svg>
          </span>
          <span className="nav__text">
            HealTrack
            <span className="nav__sub">Delivery management</span>
          </span>
        </Link>

        <button
          type="button"
          className="nav__toggle"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>

        <div className={`nav__panel${open ? " is-open" : ""}`}>
          <nav className="nav__menu" aria-label="Main">
            <a className="nav__link" href="/#features" onClick={close}>Features</a>
            <a className="nav__link" href="/#how-it-works" onClick={close}>How it works</a>
            <NavLink className={linkClass} to="/console" onClick={close}>Delivery console</NavLink>
            <NavLink className={linkClass} to="/chaos" onClick={close}>Chaos Lab</NavLink>
            <NavLink className={linkClass} to="/healing" onClick={close}>Self-Healing Portal</NavLink>
          </nav>

          <div className="nav__actions">
            <Link className="btn btn--ghost btn--sm" to="/signin" onClick={close}>Sign in</Link>
            <Link className="btn btn--primary btn--sm" to="/console" onClick={close}>Get started</Link>
          </div>
        </div>
      </div>
    </header>
  );
}
