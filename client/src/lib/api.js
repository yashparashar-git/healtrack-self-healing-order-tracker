// Shared fetch helper for the Chaos Lab and Self-Healing Portal pages.
export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

export async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    const error = new Error("Cannot reach the HealTrack API. Is the backend running?");
    error.offline = true;
    throw error;
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON response */
  }

  if (!response.ok || data?.success === false) {
    const error = new Error(data?.message || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data ?? {};
}

export function formatMs(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(Number(ms))) return "—";
  const value = Number(ms);
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.floor(value / 60000)}m ${Math.round((value % 60000) / 1000)}s`;
}

export function timeAgo(value) {
  if (!value) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

export function clockTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Incident status -> pill tone.
export function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (["recovered", "passed", "healthy", "closed", "live", "running", "pm2", "connected"].includes(value)) return "ok";
  if (["failed", "unavailable", "open", "blocked", "stopped"].includes(value)) return "bad";
  if (["degraded", "stale", "half_open", "probing", "not_supervised", "reconnecting"].includes(value)) return "warn";
  if (["detected", "diagnosing", "recovering", "verifying"].includes(value)) return "warn";
  return "info";
}
