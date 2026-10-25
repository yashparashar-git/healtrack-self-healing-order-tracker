// Chaos Lab actions are development-only, disabled by default and limited
// to requests from this machine. Optional CHAOS_TOKEN adds a shared secret
// (sent as the x-chaos-token header).

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function chaosEnabled() {
  if (process.env.NODE_ENV === "production") {
    return { enabled: false, reason: "Chaos Lab is disabled in production." };
  }
  if (process.env.ENABLE_CHAOS_LAB !== "true") {
    return { enabled: false, reason: "Chaos Lab is disabled. Set ENABLE_CHAOS_LAB=true in server/.env for local testing." };
  }
  return { enabled: true, reason: null };
}

function requireChaosAccess(req, res, next) {
  const status = chaosEnabled();
  if (!status.enabled) {
    return res.status(403).json({ success: false, message: status.reason });
  }

  if (!LOOPBACK.has(req.socket.remoteAddress)) {
    return res.status(403).json({ success: false, message: "Chaos Lab accepts requests from localhost only." });
  }

  const token = process.env.CHAOS_TOKEN;
  if (token && req.get("x-chaos-token") !== token) {
    return res.status(401).json({ success: false, message: "Missing or invalid x-chaos-token header." });
  }

  return next();
}

module.exports = { chaosEnabled, requireChaosAccess };
