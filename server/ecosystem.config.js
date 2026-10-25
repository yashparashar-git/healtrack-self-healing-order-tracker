// PM2 process definition for the local crash/restart demo.
// Start: npm run pm2:start   Logs: npm run pm2:logs   Stop: npm run pm2:stop
module.exports = {
  apps: [
    {
      name: "healtrack-api",
      script: "src/server.js",
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      restart_delay: 1000,
      watch: false,
    },
  ],
};
