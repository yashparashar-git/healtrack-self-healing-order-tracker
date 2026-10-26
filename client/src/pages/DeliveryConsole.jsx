
// File location: src/pages/DeliveryConsole.jsx
// Order delivery console: backend se connected code + poora UI, ek hi file mein.
// Sections: 1 Backend code (hook)   2 UI pieces   3 Page (sabse neeche)
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import DeliveryMap from "../components/DeliveryMap";
import ConsoleNav from "../components/ConsoleNav";

/* =====================================================================
   1. BACKEND CODE: API calls, polling, order create/load, simulation, status
   ===================================================================== */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API = `${API_BASE}/api/orders`;

const STATUSES = ["Placed", "Confirmed", "Preparing", "Out for Delivery", "Delivered"];
const ID_PATTERN = /^[a-f\d]{24}$/i;

// Location ki halat: UI is se pill ka rang aur text lega
const FRESHNESS = {
  live: { tone: "ok", label: "Rider live", note: "Recently updated" },
  paused: { tone: "info", label: "Rider paused", note: "Simulation stopped" },
  stale: { tone: "warn", label: "Last known location", note: "May be stale" },
  reconnecting: { tone: "warn", label: "Reconnecting tracking", note: "Last confirmed location shown" },
  recovered: { tone: "ok", label: "Tracking restored", note: "Fresh location verified" },
  unavailable: { tone: "warn", label: "Location unavailable", note: "No valid location" },
  delivered: { tone: "ok", label: "Delivered", note: "Order delivered" },
};

// Backend tracking state -> FRESHNESS key.
const BACKEND_STATE = {
  LIVE: "live",
  STALE: "stale",
  RECONNECTING: "reconnecting",
  RECOVERED: "recovered",
  PAUSED: "paused",
  UNAVAILABLE: "unavailable",
  DELIVERED: "delivered",
};

function formatAge(seconds) {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  return `${Math.floor(seconds / 3600)} h ago`;
}

// Wahi request() jo pehle tha. Bas network/JSON error ka message saaf hai.
async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new Error("Cannot reach the server. Is the backend running?");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* response JSON nahi tha */
  }

  if (!response.ok || data?.success === false) {
    throw new Error(data?.message || `Request failed (${response.status})`);
  }
  return data ?? {};
}

function useDeliveryConsole() {
  const [customerName, setCustomerName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [searchingLocations, setSearchingLocations] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [orderIdInput, setOrderIdInput] = useState(() => sessionStorage.getItem("healtrack.selectedOrderId") || "");
  const [orderId, setOrderId] = useState(() => sessionStorage.getItem("healtrack.selectedOrderId") || "");
  const [order, setOrder] = useState(null);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const [apiChecked, setApiChecked] = useState(false);
  const [connection, setConnection] = useState("idle"); // idle | online | reconnecting
  const [fetchedAt, setFetchedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const failures = useRef(0);
  const currentId = useRef("");
  const inFlight = useRef(false);

  // Restore the selected order after navigating between Delivery Console,
  // Chaos Lab and the Self-Healing Portal.
  useEffect(() => {
    const savedId = sessionStorage.getItem("healtrack.selectedOrderId") || "";
    if (!ID_PATTERN.test(savedId)) return;
    currentId.current = savedId;
    setOrderIdInput((value) => value || savedId);
    setOrderId((value) => value || savedId);
  }, []);

  const loadTracking = useCallback(async (id, showError = false) => {
    if (!id) return;

    try {
      const data = await request(`${API}/tracking/${id}`);
      if (id !== currentId.current) return; // purane order ka late response ignore

      failures.current = 0;
      setOrder(data);
      setFetchedAt(Date.now());
      setConnection("online");
      setSimulationRunning(Boolean(data.simulationRunning));
      if (showError) setError("");
    } catch (err) {
      if (id !== currentId.current) return;

      failures.current += 1;
      if (failures.current >= 2) setConnection("reconnecting");
      if (showError) setError(err.message);
    }
  }, []);

  // Backend availability (har 10 second)
  useEffect(() => {
    let active = true;

    async function checkHealth() {
      try {
        const response = await fetch(`${API_BASE}/api/health`);
        if (active) setApiOnline(response.ok);
      } catch {
        if (active) setApiOnline(false);
      } finally {
        if (active) setApiChecked(true);
      }
    }

    checkHealth();
    const timer = setInterval(checkHealth, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // orderid usestate
  useEffect(() => {
  if (!orderId) return;

  sessionStorage.setItem("healtrack.selectedOrderId", orderId);

  currentId.current = orderId;
  setOrderIdInput(orderId);

  loadTracking(orderId);
}, [orderId]);

  // Address search (typing rukne ke 600ms baad)
  const canSearch = showSuggestions && !selectedLocation && deliveryAddress.trim().length >= 3;
  useEffect(() => {
    if (!canSearch) return undefined;

    let active = true;

    const timer = setTimeout(async () => {
      setSearchingLocations(true);
      try {
        const data = await request(`${API}/locations/search?q=${encodeURIComponent(deliveryAddress.trim())}`);
        if (active) setSuggestions(data.locations || []);
      } catch {
        if (active) setSuggestions([]);
      } finally {
        if (active) setSearchingLocations(false);
      }
    }, 600);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [canSearch, deliveryAddress]);

  // Tracking refresh (har 3 second). Pichli request khatam hone se pehle nayi nahi jaati,
  // aur tab background mein ho to refresh ruk jaata hai.
  useEffect(() => {
    if (!orderId) return undefined;
    inFlight.current = false;

    const tick = async () => {
      if (inFlight.current || document.visibilityState !== "visible") return;
      inFlight.current = true;
      try {
        await loadTracking(orderId);
      } finally {
        inFlight.current = false;
      }
    };

    tick();
    const timer = setInterval(tick, 3000);
    return () => clearInterval(timer);
  }, [orderId, loadTracking]);

  const [latestReliabilityIncident, setLatestReliabilityIncident] = useState(null);

  // Poll persisted incidents so Chaos Lab / Self-Healing Portal outcomes are
  // visible when the operator returns to this console.
  useEffect(() => {
    let active = true;
    const refreshIncidents = async () => {
      try {
        const data = await request(`${API_BASE}/api/reliability/incidents?limit=20`);
        if (!active) return;
        const incidents = Array.isArray(data.incidents) ? data.incidents : [];
        const selectedId = orderId || sessionStorage.getItem("healtrack.selectedOrderId") || "";
        const relevant = incidents.filter((incident) => {
          const incidentOrderId = incident.orderId?._id || incident.orderId;
          const isOrderIncident = selectedId && incidentOrderId && String(incidentOrderId) === String(selectedId);
          const isGlobalIncident = !incidentOrderId;
          const detectedAt = new Date(incident.detectedAt || incident.createdAt || 0).getTime();
          // Keep global incidents visible for 30 minutes, avoiding stale old notices.
          return isOrderIncident || (isGlobalIncident && Date.now() - detectedAt < 30 * 60 * 1000);
        });
        relevant.sort((a, b) => new Date(b.updatedAt || b.detectedAt || b.createdAt || 0) - new Date(a.updatedAt || a.detectedAt || a.createdAt || 0));
        setLatestReliabilityIncident(relevant[0] || null);
      } catch {
        // Incident polling is supplemental; don't hide the order if it fails.
      }
    };
    refreshIncidents();
    const timer = setInterval(refreshIncidents, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [orderId]);

  // Location ki umr client par badhti rehti hai, taaki backend band hone par "fresh" na dikhe
  const hasOrder = Boolean(order);
  useEffect(() => {
    if (!hasOrder) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasOrder]);

  // Messages khud hat jaate hain
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(""), 8000);
    return () => clearTimeout(timer);
  }, [error]);

  function chooseLocation(location) {
    setSelectedLocation(location);
    setDeliveryAddress(location.name);
    setSuggestions([]);
    setShowSuggestions(false);
    setError("");
  }

  async function createOrder(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!selectedLocation) {
      setError("Please select a delivery address from the suggestions.");
      setShowSuggestions(true);
      return;
    }

    setLoading(true);

    try {
      const data = await request(API, {
        method: "POST",
        body: JSON.stringify({
          customerName: customerName.trim(),
          deliveryAddress: selectedLocation.name,
          destinationLatitude: selectedLocation.latitude,
          destinationLongitude: selectedLocation.longitude,
        }),
      });

      const createdOrder = data.order;
      const id = createdOrder._id;

      currentId.current = id;
      sessionStorage.setItem("healtrack.selectedOrderId", id);
      failures.current = 0;
      setOrderIdInput(id);
      setOrderId(id);
      setOrder(createdOrder);
      setFetchedAt(Date.now());
      setConnection("online");
      setSimulationRunning(false);
      setMessage(`Order ${createdOrder.orderNumber} created successfully.`);

      setCustomerName("");
      setDeliveryAddress("");
      setSelectedLocation(null);
      setSuggestions([]);
      setShowSuggestions(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function trackOrder(event) {
    event.preventDefault();
    const id = orderIdInput.trim();

    if (!ID_PATTERN.test(id)) {
      setError("Order ID must be 24 characters (digits and letters a-f).");
      return;
    }

    setError("");
    setMessage("");

    if (id !== orderId) {
      setOrder(null);
      setConnection("idle");
      failures.current = 0;
    }

    currentId.current = id;
    sessionStorage.setItem("healtrack.selectedOrderId", id);
    setOrderId(id);
    await loadTracking(id, true);
  }

  async function controlSimulation(action) {
    if (!orderId) return;

    setError("");
    setMessage("");
    setBusy(true);

    try {
      const data = await request(`${API}/${orderId}/simulate/${action}`, { method: "POST" });
      setSimulationRunning(action === "start");
      setMessage(data.message || `Simulation ${action} requested.`);
      await loadTracking(orderId, true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function advanceStatus() {
    if (!orderId || !order) return;

    const nextStatus = STATUSES[STATUSES.indexOf(order.status) + 1];
    if (!nextStatus) return;

    setError("");
    setMessage("");
    setBusy(true);

    try {
      const data = await request(`${API}/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setMessage(data.message || `Status updated to ${nextStatus}.`);
      await loadTracking(orderId, true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ----- UI ke liye taiyaar values -----
  const statusIndex = order ? STATUSES.indexOf(order.status) : -1;

  const serverAge = Number(order?.locationAgeSeconds);
  const locationAge =
    Number.isFinite(serverAge) && fetchedAt ? Math.round(serverAge + (now - fetchedAt) / 1000) : null;

  const latitude = order?.location?.latitude;
  const longitude = order?.location?.longitude;
  const hasLocation =
    latitude != null &&
    longitude != null &&
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude));

  let freshness = "stale";
  const backendState = BACKEND_STATE[order?.tracking?.state];
  const staleAfterSeconds = (order?.tracking?.staleAfterMs ?? 10000) / 1000;
  if (order?.status === "Delivered") freshness = "delivered";
  else if (!hasLocation) freshness = "unavailable";
  else if (connection === "reconnecting") freshness = "stale";
  else if (backendState) {
    freshness = backendState;
    // A "live" answer that has aged locally past the threshold is stale.
    if (["live", "recovered"].includes(backendState) && locationAge !== null && locationAge > staleAfterSeconds) freshness = "stale";
  } else if (locationAge !== null && locationAge <= 10) freshness = "live";
  else if (!simulationRunning && connection === "online") freshness = "paused";

  const apiState = apiChecked ? (apiOnline ? "online" : "offline") : "checking";
  const apiLabel = { online: "API connected", offline: "API offline", checking: "Checking API" }[apiState];

  return {
    // form
    customerName, setCustomerName, deliveryAddress, setDeliveryAddress,
    selectedLocation, setSelectedLocation,
    suggestions: canSearch ? suggestions : [],
    searchingLocations: canSearch && searchingLocations,
    showSuggestions, setShowSuggestions, chooseLocation, createOrder, loading,
    // load order
    orderIdInput, setOrderIdInput, trackOrder,
    // order + tracking
    orderId, order, statusIndex, advanceStatus, controlSimulation, busy, simulationRunning,
    freshness, locationAge, hasLocation, latitude, longitude,
    // status
    apiState, apiLabel, apiOnline, apiChecked, connection, message, error,
    latestReliabilityIncident,
  };
}

/* =====================================================================
   2. UI PIECES: chhote hisse jo page par dikhte hain
   ===================================================================== */

function TrackingNotice({ order }) {
  const incident = order?.tracking?.incident;
  if (!incident) return null;

  if (["detected", "diagnosing", "recovering", "verifying"].includes(incident.status)) {
    return (
      <div className="cs-notice cs-notice--warn" role="status">
        Rider location is delayed. HealTrack detected the problem at {new Date(incident.detectedAt).toLocaleTimeString()} and is
        reconnecting tracking{incident.retryCount ? ` (retry ${incident.retryCount})` : ""}. The map shows the last confirmed location.
      </div>
    );
  }
  if (incident.status === "degraded") {
    return (
      <div className="cs-notice cs-notice--warn" role="status">
        Live tracking is unavailable right now. Showing the last confirmed location; it will update automatically when the rider reconnects.
      </div>
    );
  }
  if (incident.status === "recovered") {
    return (
      <div className="cs-notice cs-notice--ok" role="status">
        Live tracking restored at {new Date(incident.recoveredAt).toLocaleTimeString()} — a fresh rider location was received and verified.
      </div>
    );
  }
  return null;
}

// function ReliabilityIncidentNotice({ incident }) {
//   if (!incident) return null;

//   const status = String(incident.status || "detected").toLowerCase();
//   const title = incident.incidentType || incident.service || "System reliability incident";
//   const details = incident.diagnosis || incident.message || incident.description || "";

//   if (status === "recovered") {
//     return (
//       <div className="cs-notice cs-notice--ok" role="status">
//         <strong>Recovery verified:</strong> {title} is recovered. {details ? `${details} ` : ""}
//         {incident.recoveredAt ? `Verified at ${new Date(incident.recoveredAt).toLocaleTimeString()}.` : "The latest incident status is recovered."}
//       </div>
//     );
//   }

//   if (status === "degraded" || status === "failed") {
//     return (
//       <div className="cs-notice cs-notice--warn" role="status">
//         <strong>{status === "degraded" ? "Service degraded:" : "Recovery failed:"}</strong> {title}. {details || "The incident remains unresolved; the order is kept visible and its last known data is retained."}
//       </div>
//     );
//   }

//   return (
//     <div className="cs-notice cs-notice--warn" role="status">
//       <strong>Failure detected:</strong> {title} — status: {status}. {details || "HealTrack is tracking this incident. Your selected order remains loaded."}
//       {" "}<Link className="cs-link" to={`/healing?incident=${incident._id}`}>View / recover incident →</Link>
//     </div>
//   );
// }

// new reliasblityincidentnotice
function ReliabilityIncidentNotice({ incident }) {
  if (!incident) return null;

  const status = String(incident.status || "detected").toLowerCase();
  const title = incident.incidentType || incident.service || "System reliability incident";
  const details =
    incident.diagnosis ||
    incident.message ||
    incident.description ||
    "";

  const incidentLink = incident._id
    ? `/healing?incident=${incident._id}`
    : "/healing";

  if (status === "recovered") {
    const verificationPassed = incident.verification?.passed;

    if (verificationPassed === false) {
      return (
        <div className="cs-notice cs-notice--warn" role="status">
          <strong>Recovery not verified:</strong> {title}. The incident is marked
          recovered, but its verification result failed. Check the Self-Healing Portal.
          <Link className="cs-link" to={incidentLink}>
            {" "}Review incident →
          </Link>
        </div>
      );
    }

    return (
      <div className="cs-notice cs-notice--ok" role="status">
        <strong>Recovery reported:</strong> {title}.{" "}
        {details ? `${details} ` : ""}
        {incident.recoveredAt
          ? `Reported at ${new Date(incident.recoveredAt).toLocaleTimeString()}.`
          : "The backend reports that this incident is recovered."}
        <Link className="cs-link" to={incidentLink}>
          {" "}View incident →
        </Link>
      </div>
    );
  }

  if (status === "degraded" || status === "failed") {
    return (
      <div className="cs-notice cs-notice--warn" role="status">
        <strong>{status === "degraded" ? "Service degraded:" : "Recovery failed:"}</strong>{" "}
        {title}.{" "}
        {details ||
          "The incident remains unresolved. The selected order and its last known data should remain visible."}
        <Link className="cs-link" to={incidentLink}>
          {" "}Review / recover →
        </Link>
      </div>
    );
  }

  if (["detected", "diagnosing", "recovering", "verifying"].includes(status)) {
    const labels = {
      detected: "Failure detected",
      diagnosing: "Diagnosis in progress",
      recovering: "Recovery in progress",
      verifying: "Verifying recovery",
    };

    return (
      <div className="cs-notice cs-notice--warn" role="status">
        <strong>{labels[status]}:</strong> {title}.{" "}
        {details || "Your selected order remains loaded while HealTrack tracks the incident."}
        <Link className="cs-link" to={incidentLink}>
          {" "}Open Self-Healing Portal →
        </Link>
      </div>
    );
  }

  return (
    <div className="cs-notice cs-notice--warn" role="status">
      <strong>Incident status: {status}</strong> — {title}.{" "}
      Check the incident details before assuming recovery succeeded.
      <Link className="cs-link" to={incidentLink}>
        {" "}View incident →
      </Link>
    </div>
  );
}

function Notices({ connection, error, message }) {
  return (
    <>
      {connection === "reconnecting" && (
        <div className="cs-notice cs-notice--warn" role="alert">
          Connection lost. Retrying automatically. The location shown may be out of date.
        </div>
      )}
      {error && <div className="cs-notice cs-notice--bad" role="alert">{error}</div>}
      {message && <div className="cs-notice cs-notice--ok" role="status">{message}</div>}
    </>
  );
}

function OrderSummary({ order, freshness, locationAge, simulationRunning }) {
  const fresh = FRESHNESS[freshness];
  const tone = !order ? "" : fresh.tone === "ok" ? "cs-tile--ok" : fresh.tone === "warn" ? "cs-tile--warn" : "";

  return (
    <section className="cs-tiles" aria-label="Order summary">
      <article className="cs-tile">
        <p className="cs-tile__label">Current order</p>
        <p className="cs-tile__value">{order?.orderNumber || "No order loaded"}</p>
        <p className="cs-tile__note">{order?.customerName || "Create or load an order"}</p>
      </article>
      <article className="cs-tile">
        <p className="cs-tile__label">Delivery status</p>
        <p className="cs-tile__value">{order?.status || "Awaiting order"}</p>
        <p className="cs-tile__note">Current workflow stage</p>
      </article>
      <article className={`cs-tile ${tone}`}>
        <p className="cs-tile__label">Location updated</p>
        <p className="cs-tile__value">{order ? formatAge(locationAge) : "—"}</p>
        <p className="cs-tile__note">{order ? fresh.note : "No location data"}</p>
      </article>
      <article className="cs-tile">
        <p className="cs-tile__label">Rider simulation</p>
        <p className="cs-tile__value">{simulationRunning ? "Running" : "Stopped"}</p>
        <p className="cs-tile__note">Refreshes every 3 seconds</p>
      </article>
    </section>
  );
}

function OrderForm({
  createOrder, customerName, setCustomerName, deliveryAddress, setDeliveryAddress,
  selectedLocation, setSelectedLocation, showSuggestions, setShowSuggestions,
  searchingLocations, suggestions, chooseLocation, loading,
}) {
  return (
    <section className="cs-card">
      <h2 className="cs-card__title">Create an order</h2>

      <form className="cs-form" onSubmit={createOrder}>
        <div className="field">
          <label className="field__label" htmlFor="customerName">Customer name</label>
          <input
            className="field__input"
            id="customerName"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="Enter customer name"
            required
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="deliveryAddress">Delivery address</label>
          <div className="cs-search">
            <input
              className="field__input"
              id="deliveryAddress"
              value={deliveryAddress}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setShowSuggestions(false)}
              onKeyDown={(event) => event.key === "Escape" && setShowSuggestions(false)}
              onChange={(event) => {
                setDeliveryAddress(event.target.value);
                setSelectedLocation(null);
                setShowSuggestions(true);
              }}
              placeholder="Search area, city or address"
              autoComplete="off"
              required
            />

            {showSuggestions && !selectedLocation && (
              <div className="cs-suggest" role="listbox">
                {deliveryAddress.trim().length < 3 ? (
                  <p className="cs-suggest__info">Enter at least 3 characters to search.</p>
                ) : searchingLocations ? (
                  <p className="cs-suggest__info">Searching locations...</p>
                ) : suggestions.length > 0 ? (
                  suggestions.map((location, index) => (
                    <button
                      type="button"
                      role="option"
                      className="cs-suggest__item"
                      key={`${location.latitude}-${location.longitude}-${index}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => chooseLocation(location)}
                    >
                      {location.name}
                    </button>
                  ))
                ) : (
                  <p className="cs-suggest__info">No locations found. Try adding the area and city.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {selectedLocation && (
          <p className="cs-selected">
            Location selected: {selectedLocation.latitude.toFixed(5)}, {selectedLocation.longitude.toFixed(5)}
            <button
              type="button"
              className="cs-link"
              onClick={() => {
                setSelectedLocation(null);
                setShowSuggestions(true);
              }}
            >
              Change
            </button>
          </p>
        )}

        <button className="btn btn--primary btn--block" disabled={loading}>
          {loading ? "Generating road route..." : "Create delivery"}
        </button>

        <p className="cs-hint">
          Pick a suggested location to use its coordinates. Address lookup and routing need internet access.
        </p>
      </form>
    </section>
  );
}

function LoadOrder({ trackOrder, orderIdInput, setOrderIdInput }) {
  return (
    <section className="cs-card">
      <h2 className="cs-card__title">Load an order</h2>

      <form className="cs-form" onSubmit={trackOrder}>
        <div className="field">
          <label className="field__label" htmlFor="orderId">Order ID</label>
          <input
            className="field__input"
            id="orderId"
            value={orderIdInput}
            onChange={(event) => setOrderIdInput(event.target.value)}
            placeholder="Paste order ID"
          />
        </div>
        <button className="btn btn--ghost btn--block">Load tracking details</button>
      </form>
    </section>
  );
}

function MapPanel({
  order, freshness, locationAge, simulationRunning, busy, controlSimulation,
  hasLocation, latitude, longitude,
}) {
  if (!order) {
    return (
      <section className="cs-card cs-empty">
        <h2 className="cs-card__title">Delivery tracking</h2>
        <p>No delivery loaded yet. Create an order or load an existing ID to see the route, rider and status.</p>
      </section>
    );
  }

  const fresh = FRESHNESS[freshness];
  const showAge = ["live", "stale", "reconnecting"].includes(freshness) && locationAge !== null;

  return (
    <section className="cs-card">
      <div className="cs-card__head">
        <div>
          <h2 className="cs-card__title">Delivery tracking</h2>
          <p className="cs-sub">{order.orderNumber} for {order.customerName}</p>
        </div>
        <span className={`cs-pill cs-pill--${fresh.tone}`}>
          <span className="dot" />
          {fresh.label}{showAge && `, ${formatAge(locationAge)}`}
        </span>
      </div>

      <div className="cs-toolbar">
        <p className="cs-toolbar__dest">To: {order.destinationLocation?.name || order.deliveryAddress}</p>
        <div className="cs-toolbar__actions">
          <button className="btn btn--primary btn--sm" disabled={busy || simulationRunning || freshness === "delivered"} onClick={() => controlSimulation("start")}>
            Start rider
          </button>
          <button className="btn btn--ghost btn--sm" disabled={busy || !simulationRunning} onClick={() => controlSimulation("stop")}>
            Stop
          </button>
        </div>
      </div>

      <div className="cs-map">
        {hasLocation ? (
          <DeliveryMap
            location={order.location}
            pickupLocation={order.pickupLocation}
            destinationLocation={order.destinationLocation}
            routeCoordinates={order.routeCoordinates}
          />
        ) : (
          <div className="cs-map__empty">Location temporarily unavailable</div>
        )}
      </div>

      <dl className="cs-coords">
        <div><dt>LATITUDE</dt><dd>{hasLocation ? Number(latitude).toFixed(6) : "—"}</dd></div>
        <div><dt>LONGITUDE</dt><dd>{hasLocation ? Number(longitude).toFixed(6) : "—"}</dd></div>
        <div><dt>ROUTE POINTS</dt><dd>{order.routeCoordinates?.length || 0}</dd></div>
      </dl>
    </section>
  );
}

function StatusTimeline({ order, statusIndex, advanceStatus, busy }) {
  if (!order) return null;

  const done = statusIndex >= STATUSES.length - 1;

  return (
    <section className="cs-card">
      <div className="cs-card__head">
        <h2 className="cs-card__title">Order progress</h2>
        <span className="cs-sub">{Math.max(0, statusIndex + 1)} of {STATUSES.length}</span>
      </div>

      <ol className="cs-steps">
        {STATUSES.map((status, index) => (
          <li
            key={status}
            className={`${index < statusIndex ? "is-done" : ""} ${index === statusIndex ? "is-current" : ""}`}
            aria-current={index === statusIndex ? "step" : undefined}
          >
            <span className="cs-steps__node">{index < statusIndex ? "✓" : index + 1}</span>
            <span>{status}</span>
          </li>
        ))}
      </ol>

      <button className="btn btn--ghost btn--block" onClick={advanceStatus} disabled={busy || statusIndex < 0 || done}>
        {done ? "Order delivered" : `Mark as ${STATUSES[statusIndex + 1]}`}
      </button>
    </section>
  );
}

const RELIABILITY_LINKS = [
  ["/healing", "Self-Healing Portal", "Live health, incidents, verified recoveries and TTD/TTR"],
  ["/chaos", "Chaos Lab", "Inject controlled failures and measure recovery"],
];

function SystemHealth({ apiState, apiLabel, connection, orderId, order, simulationRunning }) {
  const apiTone = apiState === "online" ? "ok" : apiState === "offline" ? "bad" : "info";
  const link = connection === "online" ? ["ok", "Connected"] : connection === "reconnecting" ? ["warn", "Reconnecting"] : ["info", orderId ? "Connecting" : "No order"];

  return (
    <section className="cs-card">
      <h2 className="cs-card__title">System health</h2>

      <ul className="cs-health">
        <li><span>API server</span><span className={`cs-pill cs-pill--${apiTone}`}><span className="dot" />{apiLabel}</span></li>
        <li><span>Tracking connection</span><span className={`cs-pill cs-pill--${link[0]}`}><span className="dot" />{link[1]}</span></li>
        {order?.tracking && (
          <li>
            <span>Last confirmed location</span>
            <span className="cs-sub">
              {order.tracking.lastSuccessfulLocationAt ? new Date(order.tracking.lastSuccessfulLocationAt).toLocaleTimeString() : "—"}
              {order.tracking.lastError && order.tracking.consecutiveFailures > 0 ? ` · last error: ${order.tracking.lastError}` : ""}
            </span>
          </li>
        )}
        <li><span>Rider simulation</span><span className={`cs-pill cs-pill--${simulationRunning ? "ok" : "info"}`}><span className="dot" />{simulationRunning ? "Running" : "Stopped"}</span></li>
      </ul>

      <div className="cs-soon">
        {RELIABILITY_LINKS.map(([to, title, text]) => (
          <Link className="cs-soon__item" key={to} to={to}>
            <p className="cs-soon__title">{title} →</p>
            <p className="cs-soon__text">{text}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* =====================================================================
   3. PAGE: sab kuch yahan jud kar dikhta hai
   ===================================================================== */
// Sirf layout. Saara data useDeliveryConsole hook se aata hai.

export default function DeliveryConsole() {
  const c = useDeliveryConsole();

  return (
    <>
      <ConsoleNav apiState={c.apiState} apiLabel={c.apiLabel} />

      <main className="container cs-page">
        <div className="cs-head">
          <h1>Delivery console</h1>
          <p>Create an order, follow its route and control the rider.</p>
          <Link className="btn btn--ghost btn--sm" to="/healing">Open Self-Healing Portal →</Link>
        </div>

        <Notices connection={c.connection} error={c.error} message={c.message} />
        <TrackingNotice order={c.order} />
        <ReliabilityIncidentNotice incident={c.latestReliabilityIncident} />
        <OrderSummary {...c} />

        <div className="cs-grid">
          <aside className="cs-side">
            <OrderForm {...c} />
            <LoadOrder {...c} />
          </aside>

          <div className="cs-main">
            <MapPanel {...c} />
            <StatusTimeline {...c} />
            <SystemHealth {...c} />
          </div>
        </div>
      </main>

      <footer className="footer cs-foot">
        <div className="container footer__bottom">
          <span>HealTrack AI © 2026</span>
          <div className="footer__meta">
            <span>Simulated rider, not real GPS</span>
            <Link className="footer__link" to="/">Back to overview</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
