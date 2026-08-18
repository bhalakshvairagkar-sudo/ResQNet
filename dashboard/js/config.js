/* ResQNet runtime configuration */
window.RESQNET_CONFIG = {
  // Use same origin when served from localhost:5000, or fallback to port 5000
  BACKEND_URL: window.location.origin.startsWith('http') ? window.location.origin : 'http://localhost:5000',
  // Active Socket.IO push
  SOCKET_URL: window.location.origin.startsWith('http') ? window.location.origin : 'http://localhost:5000',
  DEFAULT_CENTER: [18.5204, 73.8567],
  DEFAULT_ZOOM: 12,
  OSRM_URL: "https://router.project-osrm.org",
  HEALTH_POLL_MS: 5000,
  INCIDENT_POLL_MS: 4000
};
