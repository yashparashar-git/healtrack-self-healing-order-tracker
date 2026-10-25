import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import NetworkCard from "../components/NetworkCard";
import Contact from "../components/Contact";
import Footer from "../components/Footer";

const FEATURES = [
  {
    number: "01",
    title: "Real-Time Order Tracking",
    text: "Follow your delivery journey with live location updates and a route map.",
  },
  {
    number: "02",
    title: "Smart Delivery Management",
    text: "Create orders, manage delivery stages, and access order information in one place.",
  },
  {
    number: "03",
    title: "Rider Location & Routes",
    text: "Visualize pickup points, delivery destinations, rider movement, and routes.",
  },
  {
    number: "04",
    title: "Order Status Timeline",
    text: "Know whether an order is placed, confirmed, being prepared, out for delivery, or delivered.",
  },
];

const STEPS = [
  ["Create", "Enter customer details and select a delivery destination."],
  ["Track", "View the delivery route and follow rider location updates."],
  ["Manage", "Monitor order progress and update delivery statuses."],
];

export default function Landing() {
  const navigate = useNavigate();
  const openConsole = () => navigate("/console");

  return (
    <>
      <Navbar onOpenConsole={openConsole} />

      <main id="top">
        <section className="hero">
          <div className="container hero__grid">
            <div>
              <span className="tag">DELIVERY MANAGEMENT PLATFORM</span>

              <h1 className="hero__title">
                Every delivery.
                <br />
                One clear view.
              </h1>

              {/* <p className="hero__text">
                Manage orders, monitor delivery progress, and visualize rider
                locations with HealTrack AI — your unified order tracking and
                delivery management platform.
              </p> */}
              <p className="hero__text">
  Manage orders, monitor delivery progress, and visualize rider
  locations with HealTrack — your unified order tracking and
  self-healing delivery management platform.
</p>

              <div className="hero__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={openConsole}
                >
                  Start Tracking →
                </button>

                <a className="btn btn--ghost" href="#features">
                  Explore Features
                </a>
              </div>

              <p className="hero__note">
                Order management · Route visualization · Delivery tracking
              </p>
            </div>

            <NetworkCard />
          </div>
        </section>

        <section className="section" id="features">
          <div className="container">
            <span className="tag">PLATFORM FEATURES</span>

            <h2 className="section__title">
              Everything you need to manage deliveries.
            </h2>

            <p className="split__text">
              From order creation to final delivery, keep essential tracking
              information accessible in one workspace.
            </p>

            <div className="cards cards--3">
              {FEATURES.map((feature) => (
                <article className="card" key={feature.number}>
                  <span className="card__num">{feature.number}</span>
                  <h3 className="card__title">{feature.title}</h3>
                  <p className="card__text">{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="how-it-works">
          <div className="container">
            <span className="tag">SIMPLE WORKFLOW</span>

            <h2 className="section__title">
              From order to doorstep.
            </h2>

            <div className="cards">
              {STEPS.map(([title, text], index) => (
                <article className="card" key={title}>
                  <span className="card__num">
                    0{index + 1}
                  </span>
                  <h3 className="card__title">{title}</h3>
                  <p className="card__text">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="cta">
              <div>
                <h2 className="cta__title">
                  Ready to track your next delivery?
                </h2>
                <p className="cta__text">
                  Create a delivery order, view its route, and monitor its progress.
                </p>
              </div>

              <button
                type="button"
                className="btn btn--primary"
                onClick={openConsole}
              >
                Open Delivery Console →
              </button>
            </div>
          </div>
        </section>

        <Contact />
      </main>

      <Footer onOpenConsole={openConsole} />
    </>
  );
}